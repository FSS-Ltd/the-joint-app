import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, expect, it } from "vitest";
import { createFixtureOwner } from "./fixtures/database.js";

const owner = createFixtureOwner();
const householdId = randomUUID(),
  userId = randomUUID(),
  membershipId = randomUUID(),
  sessionId = randomUUID(),
  ledgerAccountId = randomUUID(),
  exportAccountId = randomUUID();
beforeAll(async () => {
  await owner.household.create({ data: { id: householdId } });
  await owner.user.create({
    data: {
      id: userId,
      memberships: { create: { id: membershipId, householdId, slot: 1 } },
      sessions: {
        create: {
          id: sessionId,
          householdId,
          expiresAt: new Date(Date.now() + 3600000),
        },
      },
    },
  });
  for (const id of [ledgerAccountId, exportAccountId])
    await owner.account.create({
      data: {
        id,
        householdId,
        creatorUserId: userId,
        creatorMembershipId: membershipId,
        kind: "CURRENT",
        label: "Synthetic cascade capacity",
        owners: { create: { userId, membershipId } },
      },
    });
  await owner.$executeRaw`INSERT INTO app."ExportRequest"(id,"userId","sessionId","membershipId","householdId",archive,state,"expiresAt","downloadExpiresAt") SELECT gen_random_uuid(),${userId}::uuid,${sessionId}::uuid,${membershipId}::uuid,${householdId}::uuid,false,'READY',clock_timestamp()+interval '1 day',clock_timestamp()+interval '15 minutes' FROM generate_series(1,128)`;
  await owner.$executeRaw`INSERT INTO app."ExportSource"("exportId","accountId","householdId","membershipId",level,owned,"grantVersion","sourceVersion") SELECT e.id,${exportAccountId}::uuid,${householdId}::uuid,${membershipId}::uuid,'TOTALS',true,0,v.version FROM app."ExportRequest" e JOIN app."ExportAccountRevision" v ON v."accountId"=${exportAccountId}::uuid WHERE e."householdId"=${householdId}::uuid`;
});
afterAll(async () => {
  await owner.$executeRaw`DELETE FROM app."ExportRequest" WHERE "householdId"=${householdId}::uuid`;
  // Failed performance assertions must still clean only this fixture, in bounded
  // maintenance batches rather than raising the database statement deadline.
  for (;;) {
    const removed =
      await owner.$executeRaw`DELETE FROM app."Transaction" WHERE id IN(SELECT id FROM app."Transaction" WHERE "accountId"=${ledgerAccountId}::uuid LIMIT 500)`;
    if (removed === 0) break;
  }
  await owner.account.deleteMany({ where: { householdId } });
  await owner.household.delete({ where: { id: householdId } });
  await owner.user.delete({ where: { id: userId } });
  await owner.$disconnect();
});
it("deletes 50,000 rows within the existing statement bound while unrelated ready exports remain unchanged", async () => {
  await owner.$executeRaw`INSERT INTO app."Transaction"(id,"householdId","accountId","sourceNamespace","sourceId","sourceHash",fingerprint,"amountMinor","bookedDate",description,"updatedAt") SELECT gen_random_uuid(),${householdId}::uuid,${ledgerAccountId}::uuid,'MANUAL','cascade:'||ordinal::text,${"a".repeat(64)},${"b".repeat(64)},1,'2026-10-01'::date,'Synthetic cascade row',clock_timestamp() FROM generate_series(1,50000) ordinal`;
  const start = performance.now();
  expect(
    await owner.transaction.deleteMany({
      where: { accountId: ledgerAccountId },
    }),
  ).toEqual({ count: 50000 });
  expect(performance.now() - start).toBeLessThan(5000);
  expect(
    await owner.$queryRaw`SELECT state,count(*)::integer AS count FROM app."ExportRequest" WHERE "householdId"=${householdId}::uuid GROUP BY state`,
  ).toEqual([{ state: "READY", count: 128 }]);
});
