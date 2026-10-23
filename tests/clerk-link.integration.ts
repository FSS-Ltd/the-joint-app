import { randomBytes, randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import { authServerEnvironmentSchema } from "../packages/contracts/src/index.js";
import { createOrm } from "../packages/database/dist/client.js";
import { createDatabase } from "../packages/database/dist/index.js";
import { createApplication } from "../apps/api/src/application.js";
import { IdentityVault } from "../apps/api/src/modules/identity/identity-vault.js";
import { SessionStore } from "../apps/api/src/modules/identity/session-store.js";
import { IdentityVerifier } from "../apps/api/src/modules/identity/identity-verifier.js";
import { createClerkFixture } from "./fixtures/clerk.js";
import { createLocalAuthFixture, totp } from "./fixtures/local-auth.js";
import { createFixtureOwner } from "./fixtures/database.js";

it("links through HTTP only with two fresh proofs, preserving the legacy UUID and household", async () => {
  if (!process.env.DATABASE_URL)
    throw new Error("Local runtime database required");
  const legacy = authServerEnvironmentSchema.parse(process.env),
    auth = createLocalAuthFixture();
  const user = await auth.createConfirmedUser(),
    fixture = await createClerkFixture();
  fixture.environment.AUTH_TOKEN_KEY = legacy.AUTH_TOKEN_KEY;
  fixture.environment.AUTH_EMAIL_HASH_KEY = legacy.AUTH_EMAIL_HASH_KEY;
  const person = fixture.account(true),
    blocked = fixture.account(true);
  for (const account of [person, blocked]) {
    const value = fixture.users.get(account.userId);
    if (!value) throw new Error("Missing fixture user");
    value.email = user.email;
  }
  const owner = createFixtureOwner(),
    runtime = createOrm(process.env.DATABASE_URL),
    connection = createDatabase(process.env.DATABASE_URL, 1000);
  const vault = new IdentityVault(
    legacy.AUTH_TOKEN_KEY,
    legacy.AUTH_EMAIL_HASH_KEY,
  );
  const store = new SessionStore(
    runtime,
    vault,
    new IdentityVerifier(legacy.AUTH_ISSUER),
    auth.provider,
  );
  let acceptTotp = false;
  const app = await createApplication(connection, undefined, {
    provider: "clerk",
    database: runtime,
    environment: fixture.environment,
    legacyEnvironment: legacy,
    clerkGateway: fixture.gateway,
    clerkTotp: { verify: async () => acceptTotp },
  });
  const householdId = randomUUID();
  try {
    const factor = await auth.provider.enroll(user.session);
    const verified = await auth.provider.verifyMfa(
      user.session,
      factor.factorId,
      totp(factor.secret),
    );
    const browserToken = await store.register(verified, "NORMAL");
    await owner.household.create({
      data: {
        id: householdId,
        memberships: {
          create: { userId: user.session.user.id, slot: 1, role: "ADMIN" },
        },
      },
    });
    await app.listen(0, "127.0.0.1");
    const origin = await app.getUrl();
    const link = async (
      subject = person.userId,
      session = person.sessionId,
      old = browserToken,
    ) =>
      fetch(origin + "/v1/auth/link-legacy", {
        method: "POST",
        headers: {
          Authorization: "Bearer " + (await fixture.token(subject, session)),
          "Content-Type": "application/json",
          "X-Legacy-Session": old,
        },
        body: JSON.stringify({ factorId: "clerk_totp", code: "123456" }),
      });
    expect((await link()).status).toBe(403);
    acceptTotp = true;
    expect(
      (
        await link(
          person.userId,
          person.sessionId,
          randomBytes(32).toString("base64url"),
        )
      ).status,
    ).toBe(401);
    await owner.$executeRaw`SELECT app.apply_clerk_webhook(${fixture.environment.CLERK_ISSUER},${"evt_" + randomBytes(16).toString("hex")},${"a".repeat(64)},'user.deleted',${blocked.userId},${blocked.userId},clock_timestamp(),'DELETED')`;
    expect((await link(blocked.userId, blocked.sessionId)).status).toBe(401);
    const response = await link();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ state: "AUTHENTICATED" });
    const me = await fetch(origin + "/v1/me", {
      headers: {
        Authorization:
          "Bearer " + (await fixture.token(person.userId, person.sessionId)),
      },
    });
    expect(me.status).toBe(200);
    expect(await me.json()).toMatchObject({
      user: { id: user.session.user.id },
      membership: { householdId },
      session: { aal: "aal2" },
    });
    expect(
      await owner.$queryRaw`SELECT "userId" FROM app."ClerkIdentity" WHERE issuer=${fixture.environment.CLERK_ISSUER}`,
    ).toEqual([{ userId: user.session.user.id }]);
  } finally {
    await app.close();
    await connection.close();
    await owner.$executeRaw`DELETE FROM app."ClerkSession" WHERE issuer=${fixture.environment.CLERK_ISSUER}`;
    await owner.$executeRaw`DELETE FROM app."ClerkIdentity" WHERE issuer=${fixture.environment.CLERK_ISSUER}`;
    await owner.$executeRaw`DELETE FROM app."ClerkResourceState" WHERE issuer=${fixture.environment.CLERK_ISSUER}`;
    await owner.$executeRaw`DELETE FROM app."ClerkWebhookEvent" WHERE issuer=${fixture.environment.CLERK_ISSUER}`;
    await owner.household.deleteMany({ where: { id: householdId } });
    await owner.sessionRegistry.deleteMany({
      where: { userId: user.session.user.id },
    });
    await owner.auditEvent.deleteMany({
      where: { userId: user.session.user.id },
    });
    await owner.user.deleteMany({ where: { id: user.session.user.id } });
    await auth.deleteUser(user.session.user.id);
    await runtime.$disconnect();
    await owner.$disconnect();
  }
});
