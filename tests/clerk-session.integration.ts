import { meResponseSchema } from "../packages/contracts/src/identity.js";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { createOrm } from "../packages/database/dist/client.js";
import { createDatabase } from "../packages/database/dist/index.js";
import { createFixtureOwner } from "./fixtures/database.js";
import { createClerkFixture } from "./fixtures/clerk.js";
import { createApplication } from "../apps/api/src/application.js";
import { ClerkIdentityService } from "../apps/api/src/modules/identity/clerk/identity.service.js";
void ClerkIdentityService;
const fixture = await createClerkFixture();
if (!process.env.DATABASE_URL)
  throw new Error("Clerk session tests require local runtime settings");
const owner = createFixtureOwner(),
  runtime = createOrm(process.env.DATABASE_URL);
const connection = createDatabase(process.env.DATABASE_URL, 1000);
const revoke = vi.fn(async () => {});
const app = await createApplication(connection, undefined, {
  provider: "clerk",
  database: runtime,
  environment: fixture.environment,
  clerkGateway: fixture.gateway,
  clerkRevoker: { revoke },
});
let origin = "";
const internalUsers = new Set<string>(),
  households = new Set<string>();
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
    where: { userId: { in: [...internalUsers] } },
  });
  await owner.sessionRegistry.deleteMany({
    where: { userId: { in: [...internalUsers] } },
  });
  await owner.household.deleteMany({ where: { id: { in: [...households] } } });
  await owner.user.deleteMany({ where: { id: { in: [...internalUsers] } } });
  await runtime.$disconnect();
  await owner.$disconnect();
});
async function me(userId: string, sessionId: string) {
  const response = await fetch(origin + "/v1/me", {
    headers: {
      Authorization: "Bearer " + (await fixture.token(userId, sessionId)),
    },
  });
  if (response.ok) {
    const body = meResponseSchema.parse(await response.clone().json());
    internalUsers.add(body.user.id);
  }
  return response;
}
it("accepts only verified Clerk identity and returns internal IDs without provider tokens", async () => {
  const person = fixture.account();
  const response = await me(person.userId, person.sessionId);
  expect(response.status).toBe(200);
  const body = meResponseSchema.parse(await response.json());
  expect(body.user.id).toMatch(/^[0-9a-f-]{36}$/);
  expect(body.user.id).not.toBe(person.userId);
  expect(body.session.aal).toBe("aal1");
  expect(JSON.stringify(body)).not.toContain("sess_");
  expect(body).not.toHaveProperty("access_token");
});
it("cannot use local opaque credentials or caller-supplied household claims in Clerk mode", async () => {
  expect(
    (
      await fetch(origin + "/v1/me", {
        headers: { Authorization: "Session " + "x".repeat(43) },
      })
    ).status,
  ).toBe(401);
  const person = fixture.account();
  await me(person.userId, person.sessionId);
  const response = await fetch(
    origin + `/v1/households/${randomUUID()}/accounts`,
    {
      headers: {
        Authorization:
          "Bearer " +
          (await fixture.token(person.userId, person.sessionId, {
            o: { id: "forged", rol: "admin" },
          })),
      },
    },
  );
  expect(response.status).toBe(404);
});
it("requires configured MFA and preserves conservative proof age", async () => {
  const person = fixture.account(true);
  const response = await me(person.userId, person.sessionId);
  expect(response.status).toBe(200);
  const body = meResponseSchema.parse(await response.json());
  expect(body.session.aal).toBe("aal2");
  expect(body.factors[0]?.id).toBe("clerk_totp");
  const verifiedAt = body.session.mfaVerifiedAt;
  if (verifiedAt === null)
    throw new Error("Expected verified authenticator proof");
  expect(new Date(verifiedAt).getTime()).toBeLessThanOrEqual(
    Date.now() - 60_000,
  );
  const noProof = await fetch(origin + "/v1/households", {
    method: "POST",
    headers: {
      Authorization:
        "Bearer " +
        (await fixture.token(person.userId, person.sessionId, {
          fva: [0, -1],
        })),
      "Content-Type": "application/json",
      "Idempotency-Key": randomUUID(),
    },
    body: JSON.stringify({ name: "Synthetic home" }),
  });
  expect(noProof.status).toBe(403);
});
it("fails closed when provider status is unavailable, then recovers without changing internal identity", async () => {
  const person = fixture.account();
  const before = meResponseSchema.parse(
    await (await me(person.userId, person.sessionId)).json(),
  );
  fixture.setUnavailable(true);
  try {
    const response = await me(person.userId, person.sessionId);
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain(
      fixture.environment.CLERK_SECRET_KEY,
    );
  } finally {
    fixture.setUnavailable(false);
  }
  const after = meResponseSchema.parse(
    await (await me(person.userId, person.sessionId)).json(),
  );
  expect(after.user.id).toBe(before.user.id);
});
it("local logout remains effective even when remote cleanup fails", async () => {
  const person = fixture.account();
  await me(person.userId, person.sessionId);
  revoke.mockRejectedValueOnce(new Error("PRIVATE_FAILURE"));
  fixture.setUnavailable(true);
  const response = await fetch(origin + "/v1/auth/logout", {
    method: "POST",
    headers: {
      Authorization:
        "Bearer " + (await fixture.token(person.userId, person.sessionId)),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ scope: "local" }),
  });
  expect(response.status).toBe(200);
  expect((await response.json()).providerCleanupPending).toBe(true);
  fixture.setUnavailable(false);
  expect((await me(person.userId, person.sessionId)).status).toBe(401);
});
it("global logout denies previously unregistered old provider sessions", async () => {
  const person = fixture.account();
  await me(person.userId, person.sessionId);
  const hidden = "sess_" + randomUUID().replaceAll("-", "");
  const existing = fixture.sessions.get(person.sessionId);
  if (!existing) throw Error("Missing synthetic session");
  fixture.sessions.set(hidden, { ...existing, id: hidden });
  const response = await fetch(origin + "/v1/auth/logout", {
    method: "POST",
    headers: {
      Authorization:
        "Bearer " + (await fixture.token(person.userId, person.sessionId)),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ scope: "global" }),
  });
  expect(response.status).toBe(200);
  expect((await me(person.userId, hidden)).status).toBe(401);
});

it("replaying global logout cannot revoke a later genuine provider sign-in", async () => {
  const person = fixture.account();
  await me(person.userId, person.sessionId);
  const signed = await fixture.token(person.userId, person.sessionId);
  const headers = {
    Authorization: "Bearer " + signed,
    "Content-Type": "application/json",
  };
  expect(
    (
      await fetch(origin + "/v1/auth/logout", {
        method: "POST",
        headers,
        body: JSON.stringify({ scope: "global" }),
      })
    ).status,
  ).toBe(200);
  const binding = await owner.clerkIdentity.findUniqueOrThrow({
    where: {
      issuer_subject: {
        issuer: fixture.environment.CLERK_ISSUER,
        subject: person.userId,
      },
    },
  });
  const cutoff = binding.revokedBeforeAt?.getTime() ?? 0;
  while (Date.now() <= cutoff + 1)
    await new Promise((resolve) => setTimeout(resolve, 1));
  const previous = fixture.sessions.get(person.sessionId);
  if (!previous) throw Error("Missing fixture");
  const fresh = "sess_" + randomUUID().replaceAll("-", "");
  fixture.sessions.set(fresh, {
    ...previous,
    id: fresh,
    createdAt: Date.now(),
  });
  expect((await me(person.userId, fresh)).status).toBe(200);
  expect(
    (
      await fetch(origin + "/v1/auth/logout", {
        method: "POST",
        headers,
        body: JSON.stringify({ scope: "global" }),
      })
    ).status,
  ).toBe(200);
  expect((await me(person.userId, fresh)).status).toBe(200);
});
it("persists observed terminal provider session revocation", async () => {
  const person = fixture.account();
  await me(person.userId, person.sessionId);
  const session = fixture.sessions.get(person.sessionId);
  if (!session) throw Error("Missing fixture");
  session.status = "revoked";
  expect((await me(person.userId, person.sessionId)).status).toBe(401);
  session.status = "active";
  expect((await me(person.userId, person.sessionId)).status).toBe(401);
});
