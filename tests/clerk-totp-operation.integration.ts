import { randomBytes, randomUUID } from "node:crypto";
import { afterAll, expect, it } from "vitest";
import { createOrm } from "../packages/database/dist/client.js";
import { createFixtureOwner } from "./fixtures/database.js";
import { IdentityVault } from "../apps/api/src/modules/identity/identity-vault.js";
import { ClerkIdentityStore } from "../apps/api/src/modules/identity/clerk/identity-store.js";
import type { ClerkCredential } from "../apps/api/src/modules/identity/clerk/credential-verifier.js";

if (!process.env.DATABASE_URL) throw new Error("Owned database required");
const runtime = createOrm(process.env.DATABASE_URL);
const owner = createFixtureOwner();
const store = new ClerkIdentityStore(
  runtime,
  new IdentityVault(
    randomBytes(32).toString("base64"),
    randomBytes(32).toString("base64"),
  ),
);
const issuer = `https://fixture${randomUUID().replaceAll("-", "")}.clerk.accounts.dev`;
const users = new Set<string>();
function credential(): ClerkCredential {
  return {
    issuer,
    subject: `user_${randomUUID().replaceAll("-", "")}`,
    sessionId: `sess_${randomUUID().replaceAll("-", "")}`,
    email: `${randomUUID()}@example.test`,
    expiresAt: Date.now() + 60_000,
    sessionExpiresAt: Date.now() + 3_600_000,
    sessionCreatedAt: Date.now() - 120_000,
    mfaEnrolled: true,
    totpEnrolled: true,
    authenticatedAt: Date.now() - 60_000,
    mfaAuthenticatedAt: null,
  };
}
async function resolve(value: ClerkCredential) {
  return store.withCredential(value, async ({ principal }) => {
    users.add(principal.userId);
    return principal;
  });
}
async function event(
  value: ClerkCredential,
  hash: string | null,
  id = `evt_${randomUUID().replaceAll("-", "")}`,
) {
  await runtime.$executeRaw`SELECT app.apply_clerk_webhook_with_totp_marker(${issuer},${id},${"a".repeat(64)},'user.updated',${value.subject},${value.subject},clock_timestamp(),'ACTIVE',${hash})`;
  return id;
}
afterAll(async () => {
  await owner.$executeRaw`DELETE FROM app."ClerkTotpOperation" WHERE issuer=${issuer}`;
  await owner.$executeRaw`DELETE FROM app."ClerkWebhookEvent" WHERE issuer=${issuer}`;
  await owner.$executeRaw`DELETE FROM app."ClerkResourceState" WHERE issuer=${issuer}`;
  await owner.$executeRaw`DELETE FROM app."ClerkSession" WHERE issuer=${issuer}`;
  await owner.$executeRaw`DELETE FROM app."ClerkIdentity" WHERE issuer=${issuer}`;
  await owner.auditEvent.deleteMany({ where: { userId: { in: [...users] } } });
  await owner.sessionRegistry.deleteMany({
    where: { userId: { in: [...users] } },
  });
  await owner.user.deleteMany({ where: { id: { in: [...users] } } });
  await runtime.$disconnect();
  await owner.$disconnect();
});
it("accepts one own enrollment webhook before proof and rejects later replay restoration", async () => {
  const value = credential();
  await resolve(value);
  const hash = randomBytes(32).toString("hex");
  const operationId = await store.beginTotpProofOperation({
    issuer,
    action: "enrollment",
    nonceHash: hash,
  });
  const eventId = await event(value, hash);
  const verifiedAt = Date.now();
  await store.completeTotpProofOperation({
    operationId,
    credential: value,
    verifiedAt,
  });
  expect((await resolve(value)).aal).toBe("aal2");
  await event(value, null);
  await event(value, hash, eventId);
  await store.completeTotpProofOperation({
    operationId,
    credential: value,
    verifiedAt,
  });
  expect((await resolve(value)).aal).toBe("aal1");
  expect(
    await store.totpProofOperationStatus({ operationId, credential: value }),
  ).toBe(false);
});
it("preserves only the verified session when the own enrollment webhook arrives later", async () => {
  const value = credential();
  await resolve(value);
  const other = { ...value, sessionId: credential().sessionId };
  await resolve(other);
  await store.recordTotp(other, Date.now());
  const hash = randomBytes(32).toString("hex");
  const operationId = await store.beginTotpProofOperation({
    issuer,
    action: "enrollment",
    nonceHash: hash,
  });
  await store.completeTotpProofOperation({
    operationId,
    credential: value,
    verifiedAt: Date.now(),
  });
  await event(value, hash);
  expect((await resolve(value)).aal).toBe("aal2");
  expect((await resolve(other)).aal).toBe("aal1");
  await event(value, hash);
  expect((await resolve(value)).aal).toBe("aal1");
});
it("rejects an unrelated update crossing the checkpoint and a reused nonce", async () => {
  const value = credential();
  await resolve(value);
  const hash = randomBytes(32).toString("hex");
  const operationId = await store.beginTotpProofOperation({
    issuer,
    action: "enrollment",
    nonceHash: hash,
  });
  await expect(
    store.beginTotpProofOperation({
      issuer,
      action: "enrollment",
      nonceHash: hash,
    }),
  ).rejects.toThrow();
  await event(value, null);
  await event(value, hash);
  await expect(
    store.completeTotpProofOperation({
      operationId,
      credential: value,
      verifiedAt: Date.now(),
    }),
  ).rejects.toThrow();
  expect((await resolve(value)).aal).toBe("aal1");
});
it("waits for an uncommitted webhook before establishing the checkpoint", async () => {
  const value = credential();
  await resolve(value);
  let release!: () => void;
  let inserted!: () => void;
  const held = new Promise<void>((done) => {
    release = done;
  });
  const ready = new Promise<void>((done) => {
    inserted = done;
  });
  const write = runtime.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT app.apply_clerk_webhook_with_totp_marker(${issuer},${`evt_${randomUUID().replaceAll("-", "")}`},${"b".repeat(64)},'user.updated',${value.subject},${value.subject},clock_timestamp(),'ACTIVE',${null})`;
    inserted();
    await held;
  });
  await ready;
  const begin = store.beginTotpProofOperation({
    issuer,
    action: "sign-in",
    nonceHash: null,
  });
  expect(
    await Promise.race([
      begin.then(() => "finished"),
      new Promise<string>((done) => setTimeout(() => done("blocked"), 100)),
    ]),
  ).toBe("blocked");
  release();
  await write;
  const operationId = await begin;
  await store.completeTotpProofOperation({
    operationId,
    credential: value,
    verifiedAt: Date.now(),
  });
  expect((await resolve(value)).aal).toBe("aal2");
});
it("rejects proof after session revocation", async () => {
  const value = credential();
  await resolve(value);
  const operationId = await store.beginTotpProofOperation({
    issuer,
    action: "sign-in",
    nonceHash: null,
  });
  await runtime.$executeRaw`SELECT app.apply_clerk_webhook(${issuer},${`evt_${randomUUID().replaceAll("-", "")}`},${"c".repeat(64)},'session.revoked',${value.sessionId},${value.subject},clock_timestamp(),'REVOKED')`;
  await expect(
    store.completeTotpProofOperation({
      operationId,
      credential: value,
      verifiedAt: Date.now(),
    }),
  ).rejects.toThrow();
});
it("expires pending operations and invalidates a late enrollment webhook", async () => {
  const value = credential();
  await resolve(value);
  const hash = randomBytes(32).toString("hex");
  const operationId = await store.beginTotpProofOperation({
    issuer,
    action: "enrollment",
    nonceHash: hash,
  });
  await owner.$executeRaw`UPDATE app."ClerkTotpOperation" SET checkpoint=clock_timestamp()-interval '3 minutes' WHERE id=${operationId}::uuid`;
  await expect(
    store.completeTotpProofOperation({
      operationId,
      credential: value,
      verifiedAt: Date.now(),
    }),
  ).rejects.toThrow();
  await store.recordTotp(value, Date.now());
  await event(value, hash);
  expect((await resolve(value)).aal).toBe("aal1");
});
it("does not preserve a newer proof when an older operation's webhook arrives", async () => {
  const value = credential();
  await resolve(value);
  const hash = randomBytes(32).toString("hex");
  const operationId = await store.beginTotpProofOperation({
    issuer,
    action: "enrollment",
    nonceHash: hash,
  });
  await store.completeTotpProofOperation({
    operationId,
    credential: value,
    verifiedAt: Date.now() - 1_000,
  });
  await store.recordTotp(value, Date.now());
  await event(value, hash);
  expect((await resolve(value)).aal).toBe("aal1");
});
it("removes completed operation metadata when its identity is purged", async () => {
  const value = credential();
  await resolve(value);
  const operationId = await store.beginTotpProofOperation({
    issuer,
    action: "sign-in",
    nonceHash: null,
  });
  await store.completeTotpProofOperation({
    operationId,
    credential: value,
    verifiedAt: Date.now(),
  });
  await owner.$executeRaw`DELETE FROM app."ClerkSession" WHERE issuer=${issuer} AND subject=${value.subject}`;
  await owner.$executeRaw`DELETE FROM app."ClerkIdentity" WHERE issuer=${issuer} AND subject=${value.subject}`;
  const rows = await owner.$queryRaw<
    { id: string }[]
  >`SELECT id FROM app."ClerkTotpOperation" WHERE id=${operationId}::uuid`;
  expect(rows).toHaveLength(0);
});
