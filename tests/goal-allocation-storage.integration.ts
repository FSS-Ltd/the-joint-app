import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, expect, it } from "vitest";
import { createFundingEvidenceFixture } from "./fixtures/funding-evidence.js";

const f = createFundingEvidenceFixture();
const goalId = randomUUID(),
  legacyGoalId = randomUUID(),
  foreignHouseholdId = randomUUID();
const allocation = {
  basis: "FIXED",
  accountId: f.account,
  valuationId: f.valuation,
  amount: { amountMinor: "100", currency: "GBP" },
};

beforeAll(async () => {
  await f.setup();
  await f.owner.household.create({ data: { id: foreignHouseholdId } });
  for (const id of [goalId, legacyGoalId])
    await f.scoped.withScope(
      f.a,
      (tx) => tx.$queryRaw`
      SELECT app.write_goal(${id}::uuid,0,${JSON.stringify({ name: "Synthetic storage goal", status: "ACTIVE", beneficiary: "ADULT", priority: 1, target: { amountMinor: "10000", currency: "GBP" }, targetDate: null })}::jsonb)`,
    );
  await f.owner
    .$executeRaw`INSERT INTO app."AccountAllocationState" ("householdId","accountId",version) VALUES (${f.hh}::uuid,${f.account}::uuid,1)`;
  await f.owner
    .$executeRaw`INSERT INTO app."AccountAllocationRevision" ("householdId","accountId","goalId",version,"valuationId",allocation)
    VALUES (${f.hh}::uuid,${f.account}::uuid,${goalId}::uuid,1,${f.valuation}::uuid,${JSON.stringify(allocation)}::jsonb)`;
  await f.owner
    .$executeRaw`INSERT INTO app."GoalAllocation" (id,"householdId","goalId","accountId","valuationId",basis,"amountMinor","sourceVersion")
    VALUES (${randomUUID()}::uuid,${f.hh}::uuid,${goalId}::uuid,${f.account}::uuid,${f.valuation}::uuid,'FIXED',100,1)`;
  await f.owner.goalAllocation.create({
    data: {
      householdId: f.hh,
      goalId: legacyGoalId,
      accountId: f.account,
      valuationId: f.valuation,
      basis: "FIXED",
      amountMinor: 100n,
    },
  });
});
afterAll(async () => {
  await f.owner.goal.deleteMany({
    where: { id: { in: [goalId, legacyGoalId] } },
  });
  await f.owner.household.deleteMany({ where: { id: foreignHouseholdId } });
  await f.close();
});

it("keeps allocation state and history inaccessible to the restricted runtime", async () => {
  for (const table of ["AccountAllocationState", "AccountAllocationRevision"]) {
    for (const statement of [
      `SELECT * FROM app."${table}"`,
      `UPDATE app."${table}" SET version=2`,
      `DELETE FROM app."${table}"`,
    ])
      await expect(
        f.scoped.withScope(f.a, (tx) => tx.$queryRawUnsafe(statement)),
      ).rejects.toBeDefined();
  }
  const privileges = await f.owner.$queryRaw<
    { table_name: string; privileges: boolean }[]
  >`
    SELECT name AS table_name,has_table_privilege('joint_app_runtime','app.'||quote_ident(name),'SELECT,INSERT,UPDATE,DELETE') AS privileges
    FROM unnest(ARRAY['AccountAllocationState','AccountAllocationRevision']) AS name`;
  expect(privileges.map((row) => row.privileges)).toEqual([false, false]);
});

it("preserves unverified legacy rows without fabricating source history or owner cutoffs", async () => {
  const rows = await f.owner.$queryRaw<
    { goalId: string; sourceVersion: number | null }[]
  >`
    SELECT "goalId","sourceVersion" FROM app."GoalAllocation" WHERE "accountId"=${f.account}::uuid`;
  expect(
    rows.find((row) => row.goalId === legacyGoalId)?.sourceVersion,
  ).toBeNull();
  expect(rows.find((row) => row.goalId === goalId)?.sourceVersion).toBe(1);
  const cutoffs = await f.owner.$queryRaw<
    { allocationCutoffVersion: number }[]
  >`
    SELECT "allocationCutoffVersion" FROM app."AccountOwner" WHERE "accountId"=${f.account}::uuid`;
  expect(cutoffs).toEqual([{ allocationCutoffVersion: 0 }]);
});

it("rejects cross-household references, malformed intentions and mutable history", async () => {
  const before = await f.owner.$queryRaw`
    SELECT * FROM app."AccountAllocationRevision" WHERE "accountId"=${f.account}::uuid`;
  await expect(f.owner
    .$executeRaw`INSERT INTO app."AccountAllocationState" ("householdId","accountId",version)
    VALUES (${foreignHouseholdId}::uuid,${f.emptyAccount}::uuid,0)`).rejects.toBeDefined();
  await expect(f.owner
    .$executeRaw`INSERT INTO app."AccountAllocationRevision" ("householdId","accountId","goalId",version,"valuationId",allocation)
    VALUES (${foreignHouseholdId}::uuid,${f.account}::uuid,${goalId}::uuid,2,${f.valuation}::uuid,${JSON.stringify(allocation)}::jsonb)`).rejects.toBeDefined();
  for (const invalid of [
    { ...allocation, accountId: f.emptyAccount },
    { ...allocation, amount: { amountMinor: "-1", currency: "GBP" } },
    { ...allocation, extra: true },
  ])
    await expect(f.owner
      .$executeRaw`INSERT INTO app."AccountAllocationRevision" ("householdId","accountId","goalId",version,"valuationId",allocation)
    VALUES (${f.hh}::uuid,${f.account}::uuid,${goalId}::uuid,2,${f.valuation}::uuid,${JSON.stringify(invalid)}::jsonb)`).rejects.toBeDefined();
  await expect(
    f.owner
      .$executeRaw`UPDATE app."AccountAllocationRevision" SET allocation=NULL,"valuationId"=NULL WHERE "accountId"=${f.account}::uuid`,
  ).rejects.toBeDefined();
  await expect(
    f.owner
      .$executeRaw`DELETE FROM app."AccountAllocationRevision" WHERE "accountId"=${f.account}::uuid`,
  ).rejects.toBeDefined();
  await expect(
    f.owner
      .$executeRaw`UPDATE app."GoalAllocation" SET "sourceVersion"=1 WHERE "goalId"=${legacyGoalId}::uuid`,
  ).rejects.toBeDefined();
  expect(
    await f.owner.$queryRaw`
    SELECT * FROM app."AccountAllocationRevision" WHERE "accountId"=${f.account}::uuid`,
  ).toEqual(before);
});
