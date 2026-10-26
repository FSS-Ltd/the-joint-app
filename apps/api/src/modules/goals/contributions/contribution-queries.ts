import {
  contributionRawPageSchema,
  contributionBudgetViewSchema,
  type ContributionRawPage,
  type ContributionRawView,
  type ContributionBudgetView,
} from "@joint/contracts";
import { assessDatedContributions } from "@joint/domain/goals";
import type { Prisma } from "@joint/database/client";
import { prepareGoalQuery } from "../goal-queries.js";

export interface ContributionSelection {
  budgetId: string | null;
  goalId: string | null;
}
export async function readContributionPage(
  tx: Prisma.TransactionClient,
  selection: ContributionSelection,
  afterVersion: number,
): Promise<ContributionRawPage> {
  await prepareGoalQuery(tx);
  const [row] = await tx.$queryRaw<{ data: unknown }[]>`
    SELECT app.read_contribution_budget(${selection.budgetId}::uuid,${selection.goalId}::uuid,${afterVersion}::integer) AS data`;
  return contributionRawPageSchema.parse(row?.data);
}
export async function authorizeContributionWrite(
  tx: Prisma.TransactionClient,
  goalId: string | null,
): Promise<void> {
  await prepareGoalQuery(tx);
  await tx.$executeRaw`SELECT app.authorize_contribution_write(${goalId}::uuid)`;
}
export function contributionView(
  raw: ContributionRawView,
): ContributionBudgetView {
  return contributionBudgetViewSchema.parse({
    ...raw,
    assessment: assessDatedContributions({
      capacity: raw.budget.capacity,
      plans: raw.plans,
    }),
  });
}
