import { ClerkCredentialVerifier } from "../apps/api/src/modules/identity/clerk/credential-verifier.js";
import { ClerkIdentityStore } from "../apps/api/src/modules/identity/clerk/identity-store.js";
import { IdentityVault } from "../apps/api/src/modules/identity/identity-vault.js";
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
const verifyTotp = vi.fn(async () => true);
const app = await createApplication(connection, undefined, {
  provider: "clerk",
  database: runtime,
  environment: fixture.environment,
  clerkGateway: fixture.gateway,
  clerkRevoker: { revoke },
  clerkTotp: { verify: verifyTotp },
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
  fixture.setUnavailable(false);
  const cleanup = await response.json();
  expect(cleanup.providerCleanupPending).toBe(true);
  expect(cleanup.providerCleanupToken).toMatch(/^v1\./);
  revoke.mockClear();
  const retry = await fetch(origin + "/v1/auth/logout/retry", {
    method: "POST",
    headers: { "X-Logout-Cleanup": cleanup.providerCleanupToken },
  });
  expect(retry.status).toBe(200);
  expect((await retry.json()).providerCleanupPending).not.toBe(true);
  expect(revoke).toHaveBeenCalledOnce();
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
  expect(
    (
      await fetch(origin + "/v1/auth/logout", {
        method: "POST",
        headers,
        body: JSON.stringify({ scope: "local" }),
      })
    ).status,
  ).toBe(401);
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
  // Use the database clock for this synthetic post-cutoff session; Docker and host clocks can differ.
  const [clock] = await owner.$queryRaw<
    { now: Date }[]
  >`SELECT clock_timestamp() AS now`;
  if (!clock) throw Error("Missing synthetic clock");
  fixture.sessions.set(fresh, {
    ...previous,
    id: fresh,
    createdAt: clock.now.getTime(),
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

it("supports backup-code enrollment while requiring explicit fresh TOTP proof for sensitive actions", async () => {
  const person = fixture.account(true);
  const user = fixture.users.get(person.userId);
  if (!user) throw Error("Missing synthetic user");
  user.otherSecondFactorsEnabled = true;
  expect(
    meResponseSchema.parse(
      await (await me(person.userId, person.sessionId)).json(),
    ).session.aal,
  ).toBe("aal1");
  const token = await fixture.token(person.userId, person.sessionId);
  const response = await fetch(origin + "/v1/auth/mfa/verify", {
    method: "POST",
    headers: {
      Authorization: "Bearer " + token,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ factorId: "clerk_totp", code: "123456" }),
  });
  expect(response.status).toBe(200);
  expect(verifyTotp).toHaveBeenCalledWith(person.userId, "123456");
  const current = meResponseSchema.parse(
    await (await me(person.userId, person.sessionId)).json(),
  );
  expect(current.session.aal).toBe("aal2");
  await owner.$executeRaw`UPDATE app."ClerkSession" SET "totpVerifiedAt"=clock_timestamp()-interval '6 minutes' WHERE issuer=${fixture.environment.CLERK_ISSUER} AND "externalSessionId"=${person.sessionId}`;
  const stale = meResponseSchema.parse(
    await (await me(person.userId, person.sessionId)).json(),
  );
  expect(stale.session.aal).toBe("aal2");
  expect(new Date(stale.session.mfaVerifiedAt ?? "").getTime()).toBeLessThan(
    Date.now() - 300000,
  );
});

it("cannot grant TOTP proof from a failed verification or a locally revoked session", async () => {
  const person = fixture.account(true);
  const user = fixture.users.get(person.userId);
  if (!user) throw Error("Missing synthetic user");
  user.otherSecondFactorsEnabled = true;
  await me(person.userId, person.sessionId);
  const token = await fixture.token(person.userId, person.sessionId);
  const verify = () =>
    fetch(origin + "/v1/auth/mfa/verify", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + token,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ factorId: "clerk_totp", code: "123456" }),
    });
  verifyTotp.mockResolvedValueOnce(false);
  expect((await verify()).status).toBe(403);
  expect(
    meResponseSchema.parse(
      await (await me(person.userId, person.sessionId)).json(),
    ).session.aal,
  ).toBe("aal1");
  await fetch(origin + "/v1/auth/logout", {
    method: "POST",
    headers: {
      Authorization: "Bearer " + token,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ scope: "local" }),
  });
  expect((await verify()).status).toBe(401);
});

it.each([false, true])(
  "provider-observed terminal session blocks an earlier in-flight JIT snapshot (existing identity=%s)",
  async (existingIdentity) => {
    const person = fixture.account(true);
    if (existingIdentity)
      expect((await me(person.userId, person.sessionId)).status).toBe(200);
    const state = fixture.sessions.get(person.sessionId);
    if (!state) throw new Error("Missing synthetic session");
    const sessionId = existingIdentity
      ? "sess_" + randomUUID().replaceAll("-", "")
      : person.sessionId;
    fixture.sessions.set(sessionId, {
      ...state,
      id: sessionId,
      status: "active",
    });
    const verifier = new ClerkCredentialVerifier(
      fixture.environment,
      fixture.gateway,
    );
    // A finished its provider read before B observed the terminal status, but has not registered locally.
    const earlier = await verifier.verify(
      await fixture.token(person.userId, sessionId),
    );
    const current = fixture.sessions.get(sessionId);
    if (!current) throw new Error("Missing synthetic session");
    current.status = "revoked";
    expect((await me(person.userId, sessionId)).status).toBe(401);
    const store = new ClerkIdentityStore(
      runtime,
      new IdentityVault(
        fixture.environment.AUTH_TOKEN_KEY,
        fixture.environment.AUTH_EMAIL_HASH_KEY,
      ),
    );
    await expect(
      store.withCredential(earlier, async ({ principal }) => {
        internalUsers.add(principal.userId);
        return principal;
      }),
    ).rejects.toMatchObject({ status: 401 });
  },
);

it("removing an authenticator during recovery cannot bypass an already established MFA requirement", async () => {
  const person = fixture.account(true);
  const user = fixture.users.get(person.userId);
  if (!user) throw new Error("Missing synthetic user");
  user.otherSecondFactorsEnabled = true;
  const meBefore = meResponseSchema.parse(
    await (await me(person.userId, person.sessionId)).json(),
  );
  expect(meBefore.session.needsMfa).toBe(true);
  user.mfaEnabled = false;
  user.totpEnabled = false;
  user.otherSecondFactorsEnabled = false;
  const meAfter = meResponseSchema.parse(
    await (await me(person.userId, person.sessionId)).json(),
  );
  expect(meAfter.session.needsMfa).toBe(true);
  const response = await fetch(origin + "/v1/households", {
    method: "POST",
    headers: {
      Authorization:
        "Bearer " + (await fixture.token(person.userId, person.sessionId)),
      "Content-Type": "application/json",
      "Idempotency-Key": randomUUID(),
    },
    body: JSON.stringify({ name: "Synthetic recovery fence" }),
  });
  expect(response.status).toBe(403);
});
