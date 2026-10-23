import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, expect, it } from "vitest";
import type { AuthContext } from "../packages/contracts/dist/index.js";
import { createFixtureOwner } from "./fixtures/database.js";
import { createOrm } from "../packages/database/dist/client.js";
import { ScopedDatabase } from "../packages/database/dist/scoped-transaction.js";
import { EntitlementService } from "../apps/api/src/modules/entitlements/entitlement.service.js";

const owner = createFixtureOwner();
if (!process.env.DATABASE_URL)
  throw new Error("Missing runtime database configuration");
const runtime = createOrm(process.env.DATABASE_URL);
const scoped = new ScopedDatabase(runtime);
const service = new EntitlementService(scoped);
const householdA = randomUUID();
const householdB = randomUUID();
const households = [householdA, householdB];
function actor(householdId: string): AuthContext {
  return {
    householdId,
    userId: randomUUID(),
    membershipId: randomUUID(),
    sessionId: randomUUID(),
    requestId: randomUUID(),
    grantVersion: 0,
    aal: "aal2",
    mfaAuthenticatedAt: Date.now(),
  };
}
const alice = actor(householdA);
const partner = actor(householdA);
const outsider = actor(householdB);
const actors = [alice, partner, outsider];
async function issue(
  context: AuthContext,
  capabilities: string[] = ["connections.bank"],
): Promise<string> {
  const id = randomUUID();
  await owner.$executeRaw`INSERT INTO app."EntitlementGrant" (id,"householdId","membershipId","userId",issuer,reason,"issuedAt","expiresAt",capabilities)
    VALUES (${id}::uuid,${context.householdId}::uuid,${context.membershipId}::uuid,${context.userId}::uuid,'Synthetic named operator','Synthetic founder trial',clock_timestamp(),clock_timestamp()+interval '1 day',${capabilities}::text[])`;
  return id;
}
beforeAll(async () => {
  await owner.household.createMany({ data: households.map((id) => ({ id })) });
  for (const [index, context] of actors.entries())
    await owner.user.create({
      data: {
        id: context.userId,
        memberships: {
          create: {
            id: context.membershipId,
            householdId: context.householdId,
            slot: index === 1 ? 2 : 1,
          },
        },
        sessions: {
          create: {
            id: context.sessionId,
            householdId: context.householdId,
            expiresAt: new Date(Date.now() + 300000),
          },
        },
      },
    });
});
afterAll(async () => {
  await runtime.$disconnect();
  await owner.$executeRaw`DELETE FROM app."EntitlementGrant" WHERE "householdId" = ANY(${households}::uuid[])`;
  await owner.$executeRaw`DELETE FROM app."EntitlementGrantAudit" WHERE "householdId" = ANY(${households}::uuid[])`;
  await owner.account.deleteMany({
    where: { householdId: { in: households } },
  });
  await owner.household.deleteMany({ where: { id: { in: households } } });
  await owner.user.deleteMany({
    where: { id: { in: actors.map((context) => context.userId) } },
  });
  await owner.$disconnect();
});
it("ignores forged client Plus, scopes each recipient and leaves account authority independent", async () => {
  const forged = { ...alice, plan: "PLUS", capabilities: ["connections.bank"] };
  expect((await service.read(forged)).plan).toBe("FREE");
  await expect(service.require(forged, "connections.bank")).rejects.toThrow();
  const partnerBefore = await service.read(partner);
  await issue(alice);
  expect(await service.read(alice)).toMatchObject({
    plan: "PLUS",
    caps: { bankAuthorisations: 4, brokerConnections: 0, companionDevices: 0 },
  });
  await expect(
    service.require(alice, "connections.bank"),
  ).resolves.toBeUndefined();
  expect(await service.read(partner)).toEqual(partnerBefore);
  expect((await service.read(outsider)).plan).toBe("FREE");
  expect(
    await runtime.$queryRaw`SELECT id FROM app."EntitlementGrant"`,
  ).toEqual([]);
  expect(
    await scoped.withScope(
      outsider,
      (tx) => tx.$queryRaw`SELECT id FROM app."EntitlementGrant"`,
    ),
  ).toEqual([]);
  const privateAccount = await owner.account.create({
    data: {
      householdId: partner.householdId,
      creatorUserId: partner.userId,
      creatorMembershipId: partner.membershipId,
      kind: "CURRENT",
      label: "Synthetic partner private account",
      owners: {
        create: { userId: partner.userId, membershipId: partner.membershipId },
      },
    },
  });
  expect(
    await scoped.withScope(alice, (tx) =>
      tx.account.findMany({ where: { id: privateAccount.id } }),
    ),
  ).toEqual([]);
  const [access] = await scoped.withScope(
    alice,
    (tx) =>
      tx.$queryRaw<
        { allowed: boolean }[]
      >`SELECT app.account_access(${privateAccount.id}::uuid,'TRANSACTIONS') AS allowed`,
  );
  expect(access?.allowed).toBe(false);
});
it("denies runtime writes and logs maintenance issuance and edits", async () => {
  const id = await issue(partner, ["projections.advanced"]);
  for (const operation of [
    () =>
      scoped.withScope(
        partner,
        (tx) =>
          tx.$executeRaw`UPDATE app."EntitlementGrant" SET reason='forged' WHERE id=${id}::uuid`,
      ),
    () =>
      scoped.withScope(
        partner,
        (tx) =>
          tx.$executeRaw`DELETE FROM app."EntitlementGrant" WHERE id=${id}::uuid`,
      ),
    () =>
      scoped.withScope(
        partner,
        (tx) =>
          tx.$executeRaw`INSERT INTO app."EntitlementGrant" SELECT * FROM app."EntitlementGrant" WHERE id=${id}::uuid`,
      ),
    () =>
      scoped.withScope(
        partner,
        (tx) => tx.$queryRaw`SELECT * FROM app."EntitlementGrantAudit"`,
      ),
  ])
    await expect(operation()).rejects.toThrow();
  const before = await service.read(partner);
  await owner.$executeRaw`UPDATE app."EntitlementGrant" SET reason='Updated synthetic reason' WHERE id=${id}::uuid`;
  expect((await service.read(partner)).version).not.toBe(before.version);
  const audit = await owner.$queryRaw<
    { operation: string; issuer: string }[]
  >`SELECT operation,issuer FROM app."EntitlementGrantAudit" WHERE "grantId"=${id}::uuid ORDER BY id`;
  expect(audit).toEqual([
    { operation: "INSERT", issuer: "Synthetic named operator" },
    { operation: "UPDATE", issuer: "Synthetic named operator" },
  ]);
});
it("enforces bounded grants, named capabilities and recipient references at the SQL boundary", async () => {
  await expect(issue(alice, ["invented.capability"])).rejects.toThrow();
  const id = await issue(outsider);
  await expect(
    owner.$executeRaw`UPDATE app."EntitlementGrant" SET "expiresAt"="issuedAt"+interval '91 days' WHERE id=${id}::uuid`,
  ).rejects.toThrow();
  await expect(
    owner.$executeRaw`UPDATE app."EntitlementGrant" SET issuer=' ' WHERE id=${id}::uuid`,
  ).rejects.toThrow();
  await expect(
    owner.$executeRaw`UPDATE app."EntitlementGrant" SET "householdId"=${alice.householdId}::uuid WHERE id=${id}::uuid`,
  ).rejects.toThrow();
});
it("rechecks expiry, revocation and live session scope for every authorization", async () => {
  const id = await issue(outsider, ["connections.broker"]);
  const before = await service.read(outsider);
  await owner.$executeRaw`UPDATE app."EntitlementGrant" SET "issuedAt"=clock_timestamp()-interval '2 days',"expiresAt"=clock_timestamp()-interval '1 day' WHERE id=${id}::uuid`;
  const expired = await service.read(outsider);
  expect(expired.capabilities).not.toContain("connections.broker");
  expect(expired.version).not.toBe(before.version);
  await expect(
    service.require(outsider, "connections.broker"),
  ).rejects.toThrow();
  const revokeId = await issue(outsider, ["insights.local"]);
  await owner.$executeRaw`UPDATE app."EntitlementGrant" SET "revokedAt"=clock_timestamp() WHERE id=${revokeId}::uuid`;
  await expect(service.require(outsider, "insights.local")).rejects.toThrow();
  await owner.sessionRegistry.update({
    where: { id: outsider.sessionId },
    data: { revokedAt: new Date() },
  });
  await expect(service.read(outsider)).rejects.toThrow("scope");
  await expect(service.require(outsider, "finance.manual")).rejects.toThrow(
    "scope",
  );
  await expect(
    service.read({ ...alice, householdId: outsider.householdId }),
  ).rejects.toThrow("scope");
});

it("changes the opaque version when a grant expires without a database edit", async () => {
  const id = await issue(alice, ["categorisation.automation"]);
  await owner.$executeRaw`UPDATE app."EntitlementGrant" SET "issuedAt"=clock_timestamp()-interval '1 second',"expiresAt"=clock_timestamp()+interval '500 milliseconds' WHERE id=${id}::uuid`;
  const before = await service.read(alice);
  expect(before.capabilities).toContain("categorisation.automation");
  await owner.$queryRaw`SELECT pg_sleep(0.6)::text`;
  const after = await service.read(alice);
  expect(after.capabilities).not.toContain("categorisation.automation");
  expect(after.version).not.toBe(before.version);
});
