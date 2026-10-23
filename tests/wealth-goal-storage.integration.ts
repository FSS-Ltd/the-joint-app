import { createHash, randomUUID } from "node:crypto";
import { afterAll, beforeAll, expect, it } from "vitest";
import { createFixtureOwner } from "./fixtures/database.js";
import { createOrm } from "../packages/database/dist/client.js";

const owner = createFixtureOwner();
if (!process.env.DATABASE_URL)
  throw new Error("Missing runtime database configuration");
const runtime = createOrm(process.env.DATABASE_URL);
const householdA = randomUUID();
const householdB = randomUUID();
const userId = randomUUID();
const otherUserId = randomUUID();
const membershipA = randomUUID();
const membershipB = randomUUID();
const accountA = randomUUID();
const accountB = randomUUID();
const valuationA = randomUUID();
const valuationB = randomUUID();
const goalId = randomUUID();
const scenarioId = randomUUID();
const runId = randomUUID();
const basicInput = JSON.stringify({
  schema: "projection-input",
  schemaVersion: 1,
  mode: "BASIC",
});
const advancedInput = JSON.stringify({
  schema: "projection-input",
  schemaVersion: 1,
  mode: "ADVANCED",
  scenarioId,
});
const hash = (value: string) =>
  createHash("sha256").update(value).digest("hex");

beforeAll(async () => {
  await owner.household.createMany({
    data: [{ id: householdA }, { id: householdB }],
  });
  await owner.user.createMany({ data: [{ id: userId }, { id: otherUserId }] });
  await owner.membership.createMany({
    data: [
      { id: membershipA, householdId: householdA, userId, slot: 1 },
      {
        id: membershipB,
        householdId: householdB,
        userId: otherUserId,
        slot: 1,
      },
    ],
  });
  await owner.account.createMany({
    data: [
      {
        id: accountA,
        householdId: householdA,
        creatorMembershipId: membershipA,
        creatorUserId: userId,
        kind: "SAVINGS",
        label: "Synthetic A",
      },
      {
        id: accountB,
        householdId: householdB,
        creatorMembershipId: membershipB,
        creatorUserId: otherUserId,
        kind: "SAVINGS",
        label: "Synthetic B",
      },
    ],
  });
  await owner.balanceSnapshot.createMany({
    data: [
      {
        id: valuationA,
        householdId: householdA,
        accountId: accountA,
        authorMembershipId: membershipA,
        amountMinor: 100n,
        asOfDate: new Date("2026-10-23"),
      },
      {
        id: valuationB,
        householdId: householdB,
        accountId: accountB,
        authorMembershipId: membershipB,
        amountMinor: 100n,
        asOfDate: new Date("2026-10-23"),
      },
    ],
  });
  await owner.$executeRaw`INSERT INTO app."Goal" (id,"householdId",name,priority,"targetMinor") VALUES (${goalId}::uuid,${householdA}::uuid,'Synthetic goal',1,1000)`;
});

afterAll(async () => {
  await runtime.$disconnect();
  await owner.$executeRaw`DELETE FROM app."ProjectionSource" WHERE "householdId"=${householdA}::uuid`;
  await owner.$executeRaw`DELETE FROM app."GoalAllocation" WHERE "householdId"=${householdA}::uuid`;
  await owner.$executeRaw`DELETE FROM app."ProjectionRun" WHERE "householdId"=${householdA}::uuid`;
  await owner.$executeRaw`DELETE FROM app."Scenario" WHERE "householdId"=${householdA}::uuid`;
  await owner.$executeRaw`DELETE FROM app."Goal" WHERE "householdId"=${householdA}::uuid`;
  await owner.balanceSnapshot.deleteMany({
    where: { householdId: { in: [householdA, householdB] } },
  });
  await owner.account.deleteMany({
    where: { householdId: { in: [householdA, householdB] } },
  });
  await owner.household.deleteMany({
    where: { id: { in: [householdA, householdB] } },
  });
  await owner.user.deleteMany({ where: { id: { in: [userId, otherUserId] } } });
  await owner.$disconnect();
});

it("rejects cross-household and mismatched account valuations", async () => {
  await expect(
    owner.$executeRaw`INSERT INTO app."GoalAllocation" (id,"householdId","goalId","accountId","valuationId",basis,"amountMinor") VALUES (${randomUUID()}::uuid,${householdB}::uuid,${goalId}::uuid,${accountB}::uuid,${valuationB}::uuid,'FIXED',100)`,
  ).rejects.toThrow();
  await expect(
    owner.$executeRaw`INSERT INTO app."GoalAllocation" (id,"householdId","goalId","accountId","valuationId",basis,"amountMinor") VALUES (${randomUUID()}::uuid,${householdA}::uuid,${goalId}::uuid,${accountA}::uuid,${valuationB}::uuid,'FIXED',100)`,
  ).rejects.toThrow();
});

it("enforces allocation basis, amount, fraction, and one account per goal", async () => {
  await expect(
    owner.$executeRaw`INSERT INTO app."GoalAllocation" (id,"householdId","goalId","accountId","valuationId",basis) VALUES (${randomUUID()}::uuid,${householdA}::uuid,${goalId}::uuid,${accountA}::uuid,${valuationA}::uuid,'FIXED')`,
  ).rejects.toThrow();
  await expect(
    owner.$executeRaw`INSERT INTO app."GoalAllocation" (id,"householdId","goalId","accountId","valuationId",basis) VALUES (${randomUUID()}::uuid,${householdA}::uuid,${goalId}::uuid,${accountA}::uuid,${valuationA}::uuid,'FRACTION')`,
  ).rejects.toThrow();
  await expect(
    owner.$executeRaw`INSERT INTO app."GoalAllocation" (id,"householdId","goalId","accountId","valuationId",basis,"amountMinor",fraction) VALUES (${randomUUID()}::uuid,${householdA}::uuid,${goalId}::uuid,${accountA}::uuid,${valuationA}::uuid,'FIXED',100,0.5)`,
  ).rejects.toThrow();
  await expect(
    owner.$executeRaw`INSERT INTO app."GoalAllocation" (id,"householdId","goalId","accountId","valuationId",basis,fraction) VALUES (${randomUUID()}::uuid,${householdA}::uuid,${goalId}::uuid,${accountA}::uuid,${valuationA}::uuid,'FRACTION',0)`,
  ).rejects.toThrow();
  await owner.$executeRaw`INSERT INTO app."GoalAllocation" (id,"householdId","goalId","accountId","valuationId",basis,"amountMinor") VALUES (${randomUUID()}::uuid,${householdA}::uuid,${goalId}::uuid,${accountA}::uuid,${valuationA}::uuid,'FIXED',100)`;
  await expect(
    owner.$executeRaw`INSERT INTO app."GoalAllocation" (id,"householdId","goalId","accountId","valuationId",basis,"amountMinor") VALUES (${randomUUID()}::uuid,${householdA}::uuid,${goalId}::uuid,${accountA}::uuid,${valuationA}::uuid,'FIXED',200)`,
  ).rejects.toThrow();
});

it("binds immutable scenario and run evidence to matching modes and hashes", async () => {
  const missingMode = JSON.stringify({
    schema: "projection-input",
    schemaVersion: 1,
    scenarioId,
  });
  await expect(
    owner.$executeRaw`INSERT INTO app."Scenario" (id,"householdId","goalId","canonicalInput",input,"inputHash") VALUES (${scenarioId}::uuid,${householdA}::uuid,${goalId}::uuid,${missingMode},${missingMode}::jsonb,${hash(missingMode)})`,
  ).rejects.toThrow();
  await expect(
    owner.$executeRaw`INSERT INTO app."Scenario" (id,"householdId","goalId","canonicalInput",input,"inputHash") VALUES (${scenarioId}::uuid,${householdA}::uuid,${goalId}::uuid,${advancedInput},${basicInput}::jsonb,${hash(advancedInput)})`,
  ).rejects.toThrow();
  await expect(
    owner.$executeRaw`INSERT INTO app."Scenario" (id,"householdId","goalId","canonicalInput",input,"inputHash") VALUES (${scenarioId}::uuid,${householdA}::uuid,${goalId}::uuid,${advancedInput},${advancedInput}::jsonb,${"0".repeat(64)})`,
  ).rejects.toThrow();
  await owner.$executeRaw`INSERT INTO app."Scenario" (id,"householdId","goalId","canonicalInput",input,"inputHash") VALUES (${scenarioId}::uuid,${householdA}::uuid,${goalId}::uuid,${advancedInput},${advancedInput}::jsonb,${hash(advancedInput)})`;
  await expect(
    owner.$executeRaw`UPDATE app."Scenario" SET "canonicalInput"=${basicInput} WHERE id=${scenarioId}::uuid`,
  ).rejects.toThrow();
  await expect(
    owner.$executeRaw`INSERT INTO app."ProjectionRun" (id,"householdId","goalId","scenarioId",mode,"canonicalInput",input,"inputHash",result,"engineVersion","datasetVersion","grantVersion") VALUES (${randomUUID()}::uuid,${householdA}::uuid,${goalId}::uuid,${scenarioId}::uuid,'BASIC',${basicInput},${basicInput}::jsonb,${hash(basicInput)},'{}'::jsonb,'1.0.0',1,0)`,
  ).rejects.toThrow();
  await expect(
    owner.$executeRaw`INSERT INTO app."ProjectionRun" (id,"householdId","goalId",mode,"canonicalInput",input,"inputHash",result,"engineVersion","datasetVersion","grantVersion") VALUES (${randomUUID()}::uuid,${householdA}::uuid,${goalId}::uuid,'BASIC',${missingMode},${missingMode}::jsonb,${hash(missingMode)},'{}'::jsonb,'1.0.0',1,0)`,
  ).rejects.toThrow();
  await owner.$executeRaw`INSERT INTO app."ProjectionRun" (id,"householdId","goalId",mode,"canonicalInput",input,"inputHash",result,"engineVersion","datasetVersion","grantVersion") VALUES (${runId}::uuid,${householdA}::uuid,${goalId}::uuid,'BASIC',${basicInput},${basicInput}::jsonb,${hash(basicInput)},'{}'::jsonb,'1.0.0',1,0)`;
  await expect(
    owner.$executeRaw`UPDATE app."ProjectionRun" SET "grantVersion"=1 WHERE id=${runId}::uuid`,
  ).rejects.toThrow();
});

it("deduplicates tenant-matched source dependencies and denies runtime access", async () => {
  const sourceId = randomUUID();
  await owner.$executeRaw`INSERT INTO app."ProjectionSource" (id,"householdId","runId","accountId","valuationId") VALUES (${sourceId}::uuid,${householdA}::uuid,${runId}::uuid,${accountA}::uuid,${valuationA}::uuid)`;
  await expect(
    owner.$executeRaw`INSERT INTO app."ProjectionSource" (id,"householdId","runId","accountId","valuationId") VALUES (${randomUUID()}::uuid,${householdA}::uuid,${runId}::uuid,${accountA}::uuid,${valuationA}::uuid)`,
  ).rejects.toThrow();
  await expect(
    owner.$executeRaw`INSERT INTO app."ProjectionSource" (id,"householdId","runId","accountId","valuationId") VALUES (${randomUUID()}::uuid,${householdA}::uuid,${runId}::uuid,${accountA}::uuid,${valuationB}::uuid)`,
  ).rejects.toThrow();
  await expect(
    owner.$executeRaw`UPDATE app."ProjectionSource" SET "valuationId"=${valuationA}::uuid WHERE id=${sourceId}::uuid`,
  ).rejects.toThrow();
  await expect(runtime.$queryRaw`SELECT id FROM app."Goal"`).rejects.toThrow();
  await expect(
    runtime.$executeRaw`INSERT INTO app."Goal" (id,"householdId",name,priority,"targetMinor") VALUES (${randomUUID()}::uuid,${householdA}::uuid,'Forged',1,100)`,
  ).rejects.toThrow();
});

it("forces RLS and grants no runtime privileges on every new table", async () => {
  const tables = await owner.$queryRaw<
    {
      name: string;
      rls: boolean;
      forced: boolean;
      canRead: boolean;
      canWrite: boolean;
      policies: string[];
    }[]
  >`SELECT c.relname::text AS name, c.relrowsecurity AS rls,
      c.relforcerowsecurity AS forced,
      has_table_privilege('joint_app_runtime', c.oid, 'SELECT') AS "canRead",
      has_table_privilege('joint_app_runtime', c.oid, 'INSERT,UPDATE,DELETE') AS "canWrite",
      ARRAY(SELECT p.polname::text FROM pg_catalog.pg_policy p WHERE p.polrelid=c.oid ORDER BY p.polname) AS policies
    FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='app' AND c.relname IN ('Goal','GoalAllocation','ContributionPlan','ContributionStep','Scenario','ProjectionRun','ProjectionSource')
    ORDER BY c.relname`;
  expect(tables.map(({ name }) => name)).toEqual([
    "ContributionPlan",
    "ContributionStep",
    "Goal",
    "GoalAllocation",
    "ProjectionRun",
    "ProjectionSource",
    "Scenario",
  ]);
  for (const table of tables)
    expect(table).toMatchObject({
      rls: true,
      forced: true,
      canRead: false,
      canWrite: false,
      policies: ["maintenance"],
    });
});
