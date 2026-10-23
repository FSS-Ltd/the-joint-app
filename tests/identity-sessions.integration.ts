import { randomBytes, randomUUID } from "node:crypto";
import { afterAll, beforeAll, expect, it } from "vitest";
import type { AuthProvider } from "../apps/api/src/modules/identity/auth-provider.js";
type AuthSession = Awaited<ReturnType<AuthProvider["login"]>>;
type AuthUser = AuthSession["user"];
import { createOrm } from "../packages/database/dist/client.js";
import { startIdentityFixture } from "./fixtures/identity.js";
import { IdentityVerifier } from "../apps/api/src/modules/identity/identity-verifier.js";
import { IdentityVault } from "../apps/api/src/modules/identity/identity-vault.js";
import { SessionStore } from "../apps/api/src/modules/identity/session-store.js";

const database = createOrm(
  process.env.DATABASE_URL ??
    "postgresql://joint:local-development-only@127.0.0.1:5432/joint",
);
const vault = new IdentityVault(
  randomBytes(32).toString("base64"),
  randomBytes(32).toString("base64"),
);
const fixture = await startIdentityFixture();
const user: AuthUser = {
  id: randomUUID(),
  email: "sessions@example.test",
  email_confirmed_at: new Date().toISOString(),
  app_metadata: {},
  user_metadata: {},
  aud: "authenticated",
  created_at: new Date().toISOString(),
};
const sessionId = randomUUID();
let refreshes = 0;
let unavailable = false;
let providerSession: AuthSession;
const provider = {
  async refresh(): Promise<AuthSession> {
    refreshes++;
    await new Promise((resolve) => setTimeout(resolve, 50));
    return providerSession;
  },
  async getUser(): Promise<AuthUser> {
    if (unavailable) throw new Error("Synthetic provider outage");
    return user;
  },
};
const store = new SessionStore(
  database,
  vault,
  new IdentityVerifier(fixture.issuer),
  provider,
);
let browserToken: string;
beforeAll(async () => {
  providerSession = {
    access_token: await fixture.token(user.id, sessionId),
    refresh_token: "synthetic-private-refresh",
    expires_in: 300,
    expires_at: Math.floor(Date.now() / 1000) + 300,
    token_type: "bearer",
    user,
  };
  browserToken = await store.register(providerSession, "NORMAL");
});
afterAll(async () => {
  await database.auditEvent.deleteMany({ where: { userId: user.id } });
  await database.sessionRegistry.deleteMany({ where: { userId: user.id } });
  await database.user.deleteMany({ where: { id: user.id } });
  await database.$disconnect();
  await fixture.close();
});
it("stores opaque session hashes and authenticated encrypted provider tokens", async () => {
  expect(browserToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
  const row = await database.sessionRegistry.findUniqueOrThrow({
    where: { id: sessionId },
  });
  expect(row.browserTokenHash).not.toBe(browserToken);
  expect(row.providerTokens).not.toContain(providerSession.refresh_token);
  expect(row.householdId).toBeNull();
  const identity = await store.withSession(
    browserToken,
    async (context) => context.principal,
  );
  expect(identity.userId).toBe(user.id);
  await expect(
    store.withSession(`${browserToken}bad`, async () => true),
  ).rejects.toThrow();
});
it("serialises refresh across concurrent browser requests without changing the opaque cookie", async () => {
  await database.sessionRegistry.update({
    where: { id: sessionId },
    data: { providerExpiresAt: new Date(0) },
  });
  const identities = await Promise.all(
    Array.from({ length: 5 }, () =>
      store.withSession(
        browserToken,
        async (context) => context.principal.sessionId,
      ),
    ),
  );
  expect(identities).toEqual(Array(5).fill(sessionId));
  expect(refreshes).toBe(1);
});
it("persists refreshed credentials while rolling back a failed action", async () => {
  await database.sessionRegistry.update({
    where: { id: sessionId },
    data: { providerExpiresAt: new Date(0) },
  });
  await expect(
    store.withSession(browserToken, async (identity) => {
      await identity.transaction.auditEvent.create({
        data: { userId: user.id, action: "MUST_ROLL_BACK" },
      });
      throw new Error("Synthetic rejected action");
    }),
  ).rejects.toThrow("Synthetic rejected action");
  const refreshed = await database.sessionRegistry.findUniqueOrThrow({
    where: { id: sessionId },
  });
  expect(refreshed.providerExpiresAt?.getTime()).toBeGreaterThan(Date.now());
  expect(
    await database.auditEvent.count({
      where: { userId: user.id, action: "MUST_ROLL_BACK" },
    }),
  ).toBe(0);
  const count = refreshes;
  expect(await store.withSession(browserToken, async () => true)).toBe(true);
  expect(refreshes).toBe(count);
});
it("preserves a rotated session during a transient provider user lookup failure", async () => {
  await database.sessionRegistry.update({
    where: { id: sessionId },
    data: { providerExpiresAt: new Date(0) },
  });
  unavailable = true;
  try {
    await expect(
      store.withSession(browserToken, async () => true),
    ).rejects.toThrow();
  } finally {
    unavailable = false;
  }
  const row = await database.sessionRegistry.findUniqueOrThrow({
    where: { id: sessionId },
  });
  expect(row.revokedAt).toBeNull();
  expect(row.providerExpiresAt?.getTime()).toBeGreaterThan(Date.now());
  expect(await store.withSession(browserToken, async () => true)).toBe(true);
});
it("reports an unavailable JWKS endpoint as a retryable service failure", async () => {
  const disconnected = await startIdentityFixture();
  const token = await disconnected.token(user.id, sessionId);
  const verifier = new IdentityVerifier(disconnected.issuer);
  await disconnected.close();
  await expect(verifier.verify(token)).rejects.toMatchObject({ status: 503 });
});
it("reports provider JWKS HTTP 503 as retryable rather than an invalid identity", async () => {
  const outage = await startIdentityFixture({ jwksStatus: 503 });
  try {
    const token = await outage.token(user.id, sessionId);
    await expect(
      new IdentityVerifier(outage.issuer).verify(token),
    ).rejects.toMatchObject({ status: 503 });
  } finally {
    await outage.close();
  }
});
it("denies a disabled user and a revoked session despite an unexpired signed JWT", async () => {
  await database.user.update({
    where: { id: user.id },
    data: { status: "DISABLED" },
  });
  await expect(
    store.withSession(browserToken, async () => true),
  ).rejects.toThrow();
  await database.user.update({
    where: { id: user.id },
    data: { status: "ACTIVE" },
  });
  await database.sessionRegistry.update({
    where: { id: sessionId },
    data: {
      revokedAt: new Date(),
      providerTokens: null,
      providerExpiresAt: null,
    },
  });
  await expect(
    store.withSession(browserToken, async () => true),
  ).rejects.toThrow();
  await expect(store.register(providerSession, "NORMAL")).rejects.toThrow();
});
