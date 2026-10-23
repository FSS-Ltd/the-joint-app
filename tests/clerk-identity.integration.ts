import { randomBytes, randomUUID } from "node:crypto";
import { afterAll, expect, it } from "vitest";
import { createOrm } from "../packages/database/dist/client.js";
import { ScopedDatabase } from "../packages/database/dist/scoped-transaction.js";
import { ArchiveDatabase } from "../packages/database/dist/archive-transaction.js";
import { createFixtureOwner } from "./fixtures/database.js";
import { IdentityVault } from "../apps/api/src/modules/identity/identity-vault.js";
import { ClerkIdentityStore } from "../apps/api/src/modules/identity/clerk/identity-store.js";
import type { ClerkCredential } from "../apps/api/src/modules/identity/clerk/credential-verifier.js";
import type { IdentityPrincipal } from "../apps/api/src/modules/identity/identity-context.js";

if (!process.env.DATABASE_URL)
  throw new Error("Clerk identity tests require local runtime configuration");
const runtime = createOrm(process.env.DATABASE_URL);
const owner = createFixtureOwner();
const vault = new IdentityVault(
  randomBytes(32).toString("base64"),
  randomBytes(32).toString("base64"),
);
const store = new ClerkIdentityStore(runtime, vault);
const issuer = `https://fixture${randomUUID().replaceAll("-", "")}.clerk.accounts.dev`;
const userIds = new Set<string>();
const householdIds = new Set<string>();
function credential(): ClerkCredential {
  return {
    issuer,
    subject: "user_" + randomUUID().replaceAll("-", ""),
    sessionId: "sess_" + randomUUID().replaceAll("-", ""),
    email: randomUUID() + "@example.test",
    expiresAt: Date.now() + 60_000,
    sessionExpiresAt: Date.now() + 3_600_000,
    mfaEnrolled: true,
    authenticatedAt: Date.now() - 60_000,
    mfaAuthenticatedAt: Date.now() - 60_000,
  };
}
async function resolve(value: ClerkCredential): Promise<IdentityPrincipal> {
  return store.withCredential(value, async ({ principal }) => {
    userIds.add(principal.userId);
    return principal;
  });
}
afterAll(async () => {
  await owner.$executeRaw`DELETE FROM app."ClerkSession" WHERE issuer=${issuer}`;
  await owner.$executeRaw`DELETE FROM app."ClerkIdentity" WHERE issuer=${issuer}`;
  await owner.sessionRegistry.deleteMany({
    where: { userId: { in: [...userIds] } },
  });
  await owner.auditEvent.deleteMany({
    where: { userId: { in: [...userIds] } },
  });
  await owner.account.deleteMany({
    where: { householdId: { in: [...householdIds] } },
  });
  await owner.household.deleteMany({
    where: { id: { in: [...householdIds] } },
  });
  await owner.user.deleteMany({ where: { id: { in: [...userIds] } } });
  await runtime.$disconnect();
  await owner.$disconnect();
});

it("maps external strings to stable independent UUIDs across token refresh and sessions", async () => {
  const value = credential();
  const first = await resolve(value),
    second = await resolve({ ...value, expiresAt: Date.now() + 120_000 });
  expect(first.userId).toMatch(/^[0-9a-f-]{36}$/);
  expect(first.sessionId).toMatch(/^[0-9a-f-]{36}$/);
  expect(second.userId).toBe(first.userId);
  expect(second.sessionId).toBe(first.sessionId);
  const next = await resolve({ ...value, sessionId: credential().sessionId });
  expect(next.userId).toBe(first.userId);
  expect(next.sessionId).not.toBe(first.sessionId);
  const session = await owner.sessionRegistry.findUniqueOrThrow({
    where: { id: first.sessionId },
  });
  expect(session.expiresAt.getTime()).toBeGreaterThan(
    value.expiresAt + 3_000_000,
  );
});
it("converges concurrent registration without duplicate internal users or sessions", async () => {
  const value = credential();
  const identities = await Promise.all(
    Array.from({ length: 5 }, () => resolve(value)),
  );
  expect(new Set(identities.map((entry) => entry.userId)).size).toBe(1);
  expect(new Set(identities.map((entry) => entry.sessionId)).size).toBe(1);
  expect(
    await owner.$queryRaw`SELECT 1 FROM app."ClerkIdentity" WHERE issuer=${issuer} AND subject=${value.subject}`,
  ).toHaveLength(1);
});
it("email collision never links a new Clerk subject to an existing user", async () => {
  const value = credential();
  const id = randomUUID();
  userIds.add(id);
  await owner.user.create({
    data: { id, emailHash: vault.emailHash(value.email) },
  });
  await expect(resolve(value)).rejects.toMatchObject({ status: 409 });
  expect(
    await owner.$queryRaw`SELECT 1 FROM app."ClerkIdentity" WHERE issuer=${issuer} AND subject=${value.subject}`,
  ).toEqual([]);
  expect(await owner.user.findUnique({ where: { id } })).not.toBeNull();
});
it("revoked sessions cannot register again; a genuinely new session retains the internal user", async () => {
  const value = credential(),
    first = await resolve(value);
  await owner.sessionRegistry.update({
    where: { id: first.sessionId },
    data: { revokedAt: new Date() },
  });
  await expect(resolve(value)).rejects.toMatchObject({ status: 401 });
  const fresh = await resolve({ ...value, sessionId: credential().sessionId });
  expect(fresh.userId).toBe(first.userId);
  expect(fresh.sessionId).not.toBe(first.sessionId);
});
it("deleted registry rows and disabled users cannot be recreated through JIT", async () => {
  const value = credential(),
    first = await resolve(value);
  await owner.sessionRegistry.delete({ where: { id: first.sessionId } });
  await expect(resolve(value)).rejects.toMatchObject({ status: 401 });
  await owner.user.update({
    where: { id: first.userId },
    data: { status: "DELETED", emailHash: null },
  });
  await expect(
    resolve({ ...value, sessionId: credential().sessionId }),
  ).rejects.toMatchObject({ status: 401 });
  expect(
    await owner.$queryRaw`SELECT 1 FROM app."ClerkIdentity" WHERE issuer=${issuer} AND subject=${value.subject}`,
  ).toHaveLength(1);
});
it("refuses expired credentials before registration writes", async () => {
  const value = { ...credential(), expiresAt: Date.now() - 1 };
  await expect(resolve(value)).rejects.toMatchObject({ status: 401 });
  expect(
    await owner.$queryRaw`SELECT 1 FROM app."ClerkIdentity" WHERE issuer=${issuer} AND subject=${value.subject}`,
  ).toEqual([]);
});
it("a signed subject cannot substitute another subject's external session", async () => {
  const one = credential(),
    two = credential();
  await resolve(one);
  await resolve(two);
  await expect(
    resolve({ ...two, sessionId: one.sessionId }),
  ).rejects.toMatchObject({ status: 401 });
});
it("requires fresh proof of both identities for a collision binding", async () => {
  const value = credential(),
    userId = randomUUID(),
    sessionId = randomUUID();
  userIds.add(userId);
  await owner.user.create({
    data: {
      id: userId,
      emailHash: vault.emailHash(value.email),
      sessions: {
        create: {
          id: sessionId,
          kind: "WEB",
          browserTokenHash: randomBytes(32).toString("hex"),
          providerTokens: vault.seal(
            JSON.stringify({
              access_token: "synthetic-only",
              refresh_token: "synthetic-only",
            }),
            `session:${sessionId}`,
          ),
          providerExpiresAt: new Date(Date.now() + 3_600_000),
          expiresAt: new Date(Date.now() + 3_600_000),
        },
      },
    },
  });
  const legacy: IdentityPrincipal = {
    userId,
    sessionId,
    emailHash: vault.emailHash(value.email),
    aal: "aal2",
    authenticatedAt: Date.now() - 60_000,
    mfaAuthenticatedAt: Date.now() - 60_000,
  };
  await expect(
    store.bindLegacy({ ...legacy, mfaAuthenticatedAt: null }, value),
  ).rejects.toMatchObject({ status: 403 });
  await expect(
    store.bindLegacy(legacy, { ...value, mfaAuthenticatedAt: null }),
  ).rejects.toMatchObject({ status: 403 });
  await expect(
    store.bindLegacy({ ...legacy, sessionId: randomUUID() }, value),
  ).rejects.toMatchObject({ status: 401 });
  await store.bindLegacy(legacy, value);
  const bound = await resolve(value);
  expect(bound.userId).toBe(userId);
  expect(bound.sessionId).not.toBe(sessionId);
});
it("does not expose mapping tables to the finance runtime role", async () => {
  await expect(
    runtime.$queryRaw`SELECT * FROM app."ClerkIdentity"`,
  ).rejects.toThrow();
  await expect(
    runtime.$queryRaw`SELECT * FROM app."ClerkSession"`,
  ).rejects.toThrow();
});

it("household exit denies old Clerk session and a genuinely new session reads lawful owner archive", async () => {
  const value = credential(),
    first = await resolve(value);
  const householdId = randomUUID(),
    membershipId = randomUUID(),
    accountId = randomUUID();
  householdIds.add(householdId);
  await owner.household.create({
    data: {
      id: householdId,
      memberships: {
        create: {
          id: membershipId,
          userId: first.userId,
          role: "ADMIN",
          slot: 1,
        },
      },
    },
  });
  await owner.sessionRegistry.update({
    where: { id: first.sessionId },
    data: { householdId },
  });
  await owner.account.create({
    data: {
      id: accountId,
      householdId,
      creatorUserId: first.userId,
      creatorMembershipId: membershipId,
      kind: "CURRENT",
      label: "Synthetic archive source",
      owners: { create: { userId: first.userId, membershipId } },
    },
  });
  await new ScopedDatabase(runtime).withScope(
    {
      ...first,
      householdId,
      membershipId,
      grantVersion: 0,
      requestId: randomUUID(),
    },
    async (tx) => {
      await tx.$executeRaw`SELECT app.leave_household()`;
    },
  );
  await expect(resolve(value)).rejects.toMatchObject({ status: 401 });
  const fresh = await resolve({ ...value, sessionId: credential().sessionId });
  const rows = await new ArchiveDatabase(runtime).withScope(
    { ...fresh, requestId: randomUUID() },
    (tx) =>
      tx.$queryRaw<
        { allowed: boolean }[]
      >`SELECT app.archive_owns_account(${accountId}::uuid) AS allowed`,
  );
  expect(rows[0]?.allowed).toBe(true);
});
