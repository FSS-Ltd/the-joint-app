import { afterAll, beforeAll, expect, it } from "vitest";
import { createApplication } from "../apps/api/src/application.js";
import { createDatabase } from "../packages/database/dist/index.js";
import { createOrm } from "../packages/database/dist/client.js";
import { meResponseSchema } from "../packages/contracts/src/identity.js";
import { createFixtureOwner } from "./fixtures/database.js";
import { createClerkFixture } from "./fixtures/clerk.js";

if (!process.env.DATABASE_URL)
  throw new Error("Clerk API bearer tests require disposable runtime settings");
const audience = "urn:joint:test-api";
const fixture = await createClerkFixture();
const owner = createFixtureOwner();
const runtime = createOrm(process.env.DATABASE_URL);
const connection = createDatabase(process.env.DATABASE_URL, 1000);
const userIds = new Set<string>();
const app = await createApplication(connection, undefined, {
  provider: "clerk",
  database: runtime,
  environment: {
    ...fixture.environment,
    CLERK_API_BEARER_AUDIENCE: audience,
  },
  clerkGateway: fixture.gateway,
  clerkRevoker: {
    revoke: async () => {
      throw new Error("Synthetic provider outage");
    },
  },
});
let origin = "";
beforeAll(async () => {
  await app.listen(0, "127.0.0.1");
  origin = await app.getUrl();
});
afterAll(async () => {
  await app.close();
  await connection.close();
  await owner.$executeRaw`DELETE FROM app."ClerkSession" WHERE issuer=${fixture.environment.CLERK_ISSUER}`;
  await owner.$executeRaw`DELETE FROM app."ClerkIdentity" WHERE issuer=${fixture.environment.CLERK_ISSUER}`;
  await owner.auditEvent.deleteMany({
    where: { userId: { in: [...userIds] } },
  });
  await owner.sessionRegistry.deleteMany({
    where: { userId: { in: [...userIds] } },
  });
  await owner.user.deleteMany({ where: { id: { in: [...userIds] } } });
  await runtime.$disconnect();
  await owner.$disconnect();
});

async function signIn() {
  const account = fixture.account();
  const token = await fixture.token(account.userId, account.sessionId, {
    azp: undefined,
    aud: audience,
    joint_token_use: "api-session-v1",
  });
  const headers = {
    Authorization: "Bearer " + token,
    "Content-Type": "application/json",
  };
  const response = await fetch(origin + "/v1/me", { headers });
  expect(response.status).toBe(200);
  const me = meResponseSchema.parse(await response.json());
  userIds.add(me.user.id);
  return { account, headers, me };
}

it("preserves local revocation and audit when the API-purpose session's provider is unavailable", async () => {
  const { headers, me } = await signIn();
  fixture.setUnavailable(true);
  try {
    const logout = await fetch(origin + "/v1/auth/logout", {
      method: "POST",
      headers,
      body: JSON.stringify({ scope: "local" }),
    });
    expect(logout.status).toBe(200);
    expect(await logout.json()).toMatchObject({
      state: "SIGNED_OUT",
      providerCleanupPending: true,
    });
    expect(
      await owner.auditEvent.count({
        where: { userId: me.user.id, action: "PROVIDER_LOGOUT_UNAVAILABLE" },
      }),
    ).toBe(1);
  } finally {
    fixture.setUnavailable(false);
  }
  expect((await fetch(origin + "/v1/me", { headers })).status).toBe(401);
});

it("does not let an API-purpose token or late activity revive an idle registry session", async () => {
  const { headers, me } = await signIn();
  const registry = await owner.sessionRegistry.findFirstOrThrow({
    where: { userId: me.user.id },
  });
  await owner.sessionRegistry.update({
    where: { id: registry.id },
    data: { lastSeenAt: new Date(Date.now() - 601_000) },
  });
  expect((await fetch(origin + "/v1/me", { headers })).status).toBe(401);
  expect(
    (
      await fetch(origin + "/v1/auth/session", {
        method: "POST",
        headers,
        body: JSON.stringify({ activityAgeMs: 0 }),
      })
    ).status,
  ).toBe(401);
});
