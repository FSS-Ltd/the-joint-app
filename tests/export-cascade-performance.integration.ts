import { randomBytes, randomUUID } from "node:crypto";
import { afterAll, beforeAll, expect, it } from "vitest";
import { createOrm } from "../packages/database/dist/client.js";
import { DeletionRepository } from "../packages/database/dist/deletion.repository.js";
import { createFixtureOwner } from "./fixtures/database.js";

const owner = createFixtureOwner();
if (!process.env.DATABASE_URL) throw new Error("Runtime database URL required");
const runtime = createOrm(process.env.DATABASE_URL);
const deletion = new DeletionRepository(runtime);
function actor() {
  return {
    householdId: randomUUID(),
    userId: randomUUID(),
    membershipId: randomUUID(),
    sessionId: randomUUID(),
  };
}
const erasing = actor(),
  unrelated = actor();
const ledgerAccountId = randomUUID(),
  exportAccountId = randomUUID();
beforeAll(async () => {
  for (const { context, accountId } of [
    { context: erasing, accountId: ledgerAccountId },
    { context: unrelated, accountId: exportAccountId },
  ]) {
    await owner.household.create({ data: { id: context.householdId } });
    await owner.user.create({
      data: {
        id: context.userId,
        memberships: {
          create: {
            id: context.membershipId,
            householdId: context.householdId,
            slot: 1,
          },
        },
        sessions: {
          create: {
            id: context.sessionId,
            householdId: context.householdId,
            expiresAt: new Date(Date.now() + 3600000),
          },
        },
      },
    });
    await owner.account.create({
      data: {
        id: accountId,
        householdId: context.householdId,
        creatorUserId: context.userId,
        creatorMembershipId: context.membershipId,
        kind: "CURRENT",
        label: "Synthetic cascade capacity",
        owners: {
          create: {
            userId: context.userId,
            membershipId: context.membershipId,
          },
        },
      },
    });
  }
  // Only unrelated published-scope metadata is needed to exercise invalidation
  // scans. No download is requested and no financial object is fabricated.
  await owner.$executeRaw`INSERT INTO app."ExportRequest"(id,"userId","sessionId","membershipId","householdId",archive,state,"expiresAt","downloadExpiresAt") SELECT gen_random_uuid(),${unrelated.userId}::uuid,${unrelated.sessionId}::uuid,${unrelated.membershipId}::uuid,${unrelated.householdId}::uuid,false,'READY',clock_timestamp()+interval '1 day',clock_timestamp()+interval '15 minutes' FROM generate_series(1,128)`;
  await owner.$executeRaw`INSERT INTO app."ExportSource"("exportId","accountId","householdId","membershipId",level,owned,"grantVersion","sourceVersion") SELECT e.id,${exportAccountId}::uuid,${unrelated.householdId}::uuid,${unrelated.membershipId}::uuid,'TOTALS',true,0,v.version FROM app."ExportRequest" e JOIN app."ExportAccountRevision" v ON v."accountId"=${exportAccountId}::uuid WHERE e."householdId"=${unrelated.householdId}::uuid`;
});
afterAll(async () => {
  await runtime.$disconnect();
  await owner.$executeRaw`DELETE FROM app."ExportRequest" WHERE "householdId" IN (${erasing.householdId}::uuid,${unrelated.householdId}::uuid)`;
  // A failed capacity assertion must still clean only this fixture in bounded
  // maintenance batches, without changing the application statement deadline.
  for (;;) {
    const removed =
      await owner.$executeRaw`DELETE FROM app."Transaction" WHERE id IN(SELECT id FROM app."Transaction" WHERE "accountId"=${ledgerAccountId}::uuid LIMIT 500)`;
    if (removed === 0) break;
  }
  const households = [erasing.householdId, unrelated.householdId],
    users = [erasing.userId, unrelated.userId];
  await owner.account.deleteMany({
    where: { householdId: { in: households } },
  });
  await owner.household.deleteMany({ where: { id: { in: households } } });
  await owner.auditEvent.deleteMany({ where: { userId: { in: users } } });
  await owner.$executeRaw`DELETE FROM app."DeletionRequest" WHERE "userId"=${erasing.userId}::uuid`;
  await owner.user.deleteMany({ where: { id: { in: users } } });
  await owner.$disconnect();
});
it("purges a 50,000-row account with revision, classification and private-note children within the existing bound", async () => {
  await owner.$executeRaw`INSERT INTO app."Transaction"(id,"householdId","accountId","sourceNamespace","sourceId","sourceHash",fingerprint,"amountMinor","bookedDate",description,"updatedAt") SELECT gen_random_uuid(),${erasing.householdId}::uuid,${ledgerAccountId}::uuid,'MANUAL','cascade:'||ordinal::text,${"a".repeat(64)},${"b".repeat(64)},1,'2026-10-01'::date,'Synthetic cascade row',clock_timestamp() FROM generate_series(1,50000) ordinal`;
  await owner.$executeRaw`INSERT INTO app."TransactionRevision"(id,"householdId","accountId","transactionId","actorMembershipId",version,kind,data) SELECT gen_random_uuid(),${erasing.householdId}::uuid,${ledgerAccountId}::uuid,id,${erasing.membershipId}::uuid,1,'CREATED','{}'::jsonb FROM app."Transaction" WHERE "accountId"=${ledgerAccountId}::uuid`;
  const transactions = await owner.transaction.findMany({
    where: { accountId: ledgerAccountId },
    select: { id: true },
  });
  for (let offset = 0; offset < transactions.length; offset += 500) {
    const ids = transactions.slice(offset, offset + 500).map((row) => row.id);
    await owner.$transaction(async (tx) => {
      // Match the report fixture's bounded maintenance writes. A source jumps
      // from empty to 50,000 rows without reusing its earlier tiny-table plans.
      await tx.$executeRaw`DISCARD PLANS`;
      await tx.$executeRaw`INSERT INTO app."TransactionOverride"("transactionId","householdId","accountId","authorMembershipId","classificationKind","updatedAt") SELECT id,${erasing.householdId}::uuid,${ledgerAccountId}::uuid,${erasing.membershipId}::uuid,'INCOME',clock_timestamp() FROM app."Transaction" WHERE id=ANY(${ids}::uuid[])`;
      await tx.$executeRaw`INSERT INTO app."TransactionNote"("transactionId","householdId","accountId","authorUserId","authorMembershipId",body,"updatedAt") SELECT id,${erasing.householdId}::uuid,${ledgerAccountId}::uuid,${erasing.userId}::uuid,${erasing.membershipId}::uuid,'Synthetic private cascade note',clock_timestamp() FROM app."Transaction" WHERE id=ANY(${ids}::uuid[])`;
    });
  }
  const request = await deletion.request(
    {
      ...erasing,
      aal: "aal2",
      mfaAuthenticatedAt: Date.now() - 1000,
      requestId: randomUUID(),
    },
    randomUUID(),
    randomBytes(32).toString("hex"),
    new Date(Date.now() + 86400000),
  );
  const lease = await deletion.claim(request.id);
  if (!lease) throw new Error("Synthetic deletion lease missing");
  const start = performance.now();
  await deletion.purge(lease.id, lease.leaseToken);
  expect(performance.now() - start).toBeLessThan(5000);
  expect(await owner.account.count({ where: { id: ledgerAccountId } })).toBe(0);
  expect(
    await owner.transaction.count({ where: { accountId: ledgerAccountId } }),
  ).toBe(0);
  expect(
    await owner.transactionRevision.count({
      where: { accountId: ledgerAccountId },
    }),
  ).toBe(0);
  expect(
    await owner.transactionOverride.count({
      where: { accountId: ledgerAccountId },
    }),
  ).toBe(0);
  expect(
    await owner.transactionNote.count({
      where: { accountId: ledgerAccountId },
    }),
  ).toBe(0);
  expect(
    await owner.$queryRaw`SELECT state FROM app."DeletionRequest" WHERE id=${request.id}::uuid`,
  ).toEqual([{ state: "PROVIDER_PENDING" }]);
  expect(
    await owner.$queryRaw`SELECT state,count(*)::integer AS count FROM app."ExportRequest" WHERE "householdId"=${unrelated.householdId}::uuid GROUP BY state`,
  ).toEqual([{ state: "READY", count: 128 }]);
});
