import { randomUUID } from "node:crypto";
import type {
  AuthContext,
  GoalAllocationWrite,
} from "../../packages/contracts/dist/index.js";
import { goalAllocationRawPageSchema } from "../../packages/contracts/dist/index.js";
import { createFundingEvidenceFixture } from "./funding-evidence.js";

export function createGoalAllocationFixture() {
  const f = createFundingEvidenceFixture();
  const goalId = randomUUID(),
    otherGoalId = randomUUID();
  const goalInput = {
    name: "Synthetic allocation goal",
    status: "ACTIVE",
    beneficiary: "ADULT",
    priority: 1,
    target: { amountMinor: "100000", currency: "GBP" },
    targetDate: null,
  };
  function fixed(
    accountId = f.account,
    amountMinor = "30000",
    valuationId = f.valuation,
  ) {
    return {
      basis: "FIXED" as const,
      accountId,
      valuationId,
      amount: { amountMinor, currency: "GBP" as const },
    };
  }
  function input(
    version = 0,
    allocations: GoalAllocationWrite["allocations"] = [fixed()],
  ): GoalAllocationWrite {
    return {
      accountIds: [f.account],
      sourceVersions: [{ accountId: f.account, version }],
      allocations,
    };
  }
  async function write(
    body = input(),
    goal = goalId,
    actor = f.a,
    goalVersion = 1,
  ) {
    return f.scoped.withScope(actor, async (tx) => {
      const [row] = await tx.$queryRaw<
        { data: unknown }[]
      >`SELECT app.write_goal_allocations(${goal}::uuid,${goalVersion}::integer,${JSON.stringify(body)}::jsonb) AS data`;
      return goalAllocationRawPageSchema.parse(row?.data);
    });
  }
  async function read(
    actor: AuthContext = f.a,
    ids = [f.account],
    goal = goalId,
    after: unknown = null,
  ) {
    return f.scoped.withScope(actor, async (tx) => {
      const [row] = await tx.$queryRaw<
        { data: unknown }[]
      >`SELECT app.read_goal_allocations(${goal}::uuid,${ids}::uuid[],${JSON.stringify(after)}::jsonb) AS data`;
      return goalAllocationRawPageSchema.parse(row?.data);
    });
  }
  async function setup() {
    await f.setup();
    await f.owner.balanceSnapshot.updateMany({
      where: { accountId: { in: [f.account, f.emptyAccount] } },
      data: { amountMinor: 50000n, adultAmountMinor: 50000n },
    });
    for (const [accountId, valuationId] of [
      [f.account, f.valuation],
      [f.emptyAccount, f.emptyValuation],
    ]) {
      await f.scoped.withScope(
        f.a,
        (tx) =>
          tx.$queryRaw`SELECT app.write_funding_evidence(${accountId}::uuid,0,${JSON.stringify({ valuationId, settledAdultMoney: { amountMinor: "50000", currency: "GBP" }, billReserves: { amountMinor: "0", currency: "GBP" } })}::jsonb)`,
      );
    }
    for (const id of [goalId, otherGoalId])
      await f.scoped.withScope(
        f.a,
        (tx) =>
          tx.$queryRaw`SELECT app.write_goal(${id}::uuid,0,${JSON.stringify(goalInput)}::jsonb)`,
      );
  }
  async function close() {
    await f.owner.goal.deleteMany({ where: { householdId: f.hh } });
    await f.close();
  }
  return {
    ...f,
    goalId,
    otherGoalId,
    goalInput,
    fixed,
    input,
    writeAllocation: write,
    readAllocation: read,
    setup,
    close,
  };
}
