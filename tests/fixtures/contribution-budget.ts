import { randomUUID } from "node:crypto";
import { createFundingEvidenceFixture } from "./funding-evidence.js";
import type {
  AuthContext,
  ContributionPlanWrite,
} from "../../packages/contracts/dist/index.js";
import {
  contributionRawPageSchema,
  contributionRawViewSchema,
} from "../../packages/contracts/dist/index.js";
import { contributionCapacity } from "./contribution-plans.js";

export function createContributionFixture() {
  const f = createFundingEvidenceFixture();
  const goalId = randomUUID(),
    otherGoalId = randomUUID();
  const goalInput = {
    name: "Synthetic contribution goal",
    status: "ACTIVE",
    beneficiary: "ADULT",
    priority: 1,
    target: { amountMinor: "100000", currency: "GBP" },
    targetDate: null,
  };
  function planInput(
    amountMinor = "30000",
    expectedPlanVersion = 0,
  ): ContributionPlanWrite {
    return {
      expectedGoalVersion: 1,
      expectedPlanVersion,
      firstContributionDate: "2026-11-30",
      monthlyContributions: [
        { fromMonth: 1, amount: { amountMinor, currency: "GBP" } },
      ],
    };
  }
  async function writeCapacity(
    version = 0,
    input: unknown = contributionCapacity,
    actor: AuthContext = f.a,
  ) {
    return f.scoped.withScope(actor, async (tx) => {
      const [row] = await tx.$queryRaw<{ data: unknown }[]>`
        SELECT app.write_contribution_capacity(${version}::integer,${JSON.stringify(input)}::jsonb) AS data`;
      return contributionRawViewSchema.parse(row?.data);
    });
  }
  async function writePlan(
    version: number,
    input: unknown = planInput(),
    goal = goalId,
    actor: AuthContext = f.a,
  ) {
    return f.scoped.withScope(actor, async (tx) => {
      const [row] = await tx.$queryRaw<{ data: unknown }[]>`
        SELECT app.write_contribution_plan(${goal}::uuid,${version}::integer,${JSON.stringify(input)}::jsonb) AS data`;
      return contributionRawViewSchema.parse(row?.data);
    });
  }
  async function readBudget(
    actor: AuthContext = f.a,
    goal: string | null = null,
    after = 0,
  ) {
    return f.scoped.withScope(actor, async (tx) => {
      const [row] = await tx.$queryRaw<{ data: unknown }[]>`
        SELECT app.read_contribution_budget(NULL::uuid,${goal}::uuid,${after}::integer) AS data`;
      return contributionRawPageSchema.parse(row?.data);
    });
  }
  async function leave(): Promise<void> {
    await f.scoped.withScope(
      f.a,
      (tx) => tx.$queryRaw`SELECT app.leave_household()`,
    );
    for (const actor of [f.a, f.b]) {
      actor.sessionId = randomUUID();
      await f.owner.sessionRegistry.create({
        data: {
          id: actor.sessionId,
          userId: actor.userId,
          householdId: actor === f.a ? null : f.hh,
          expiresAt: new Date(Date.now() + 600000),
        },
      });
    }
    f.b.grantVersion = (
      await f.owner.membership.findUniqueOrThrow({
        where: { id: f.b.membershipId },
      })
    ).grantVersion;
  }
  async function readArchive(budgetId: string, goal: string | null = null) {
    return f.archive.withScope(f.a, async (tx) => {
      const [row] = await tx.$queryRaw<{ data: unknown }[]>`
        SELECT app.read_contribution_budget(${budgetId}::uuid,${goal}::uuid,0) AS data`;
      return contributionRawPageSchema.parse(row?.data);
    });
  }
  async function setup(): Promise<void> {
    await f.setup();
    for (const [index, id] of [goalId, otherGoalId].entries()) {
      const input = { ...goalInput, priority: index + 1 };
      await f.scoped.withScope(
        f.a,
        (tx) =>
          tx.$queryRaw`SELECT app.write_goal(${id}::uuid,0,${JSON.stringify(input)}::jsonb)`,
      );
    }
  }
  return {
    ...f,
    goalId,
    otherGoalId,
    goalInput,
    planInput,
    writeCapacity,
    writePlan,
    readBudget,
    leave,
    readArchive,
    setup,
  };
}
