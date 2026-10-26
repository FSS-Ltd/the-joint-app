import { contributionRawPageSchema } from "../../packages/contracts/dist/index.js";

function requireContribution(value) {
  if (!value)
    throw new Error("Restored contribution privacy verification failed");
}
export async function verifyRestoredContributions(
  owner,
  scoped,
  archive,
  freshContext,
  fixture,
) {
  const { exclusive, frozen, shared } = fixture.contributions;
  for (const [table, column] of [
    ["ContributionBudget", "id"],
    ["ContributionBudgetParticipant", "budgetId"],
    ["ContributionBudgetRevision", "budgetId"],
    ["ContributionPlan", "budgetId"],
  ]) {
    const { rows } = await owner.query(
      `SELECT 1 FROM app."${table}" WHERE "${column}"=$1`,
      [exclusive.budgetId],
    );
    requireContribution(rows.length === 0);
  }
  const {
    rows: [head],
  } = await owner.query(
    'SELECT version,"updatedAt" FROM app."ContributionBudget" WHERE id=$1',
    [frozen.budgetId],
  );
  requireContribution(
    head.version === 2 &&
      head.updatedAt.toISOString() === frozen.originalCreatedAt,
  );
  const { rows: history } = await owner.query(
    'SELECT version,"createdAt" FROM app."ContributionBudgetRevision" WHERE "budgetId"=$1 ORDER BY version',
    [frozen.budgetId],
  );
  requireContribution(
    history.length === 2 &&
      history[0].version === 1 &&
      history[1].version === 2 &&
      history[1].createdAt.toISOString() === frozen.originalCreatedAt,
  );
  const { rows: caches } = await owner.query(
    'SELECT 1 FROM app."ContributionPlan" WHERE "budgetId"=$1',
    [frozen.budgetId],
  );
  requireContribution(caches.length === 0);
  const actor = await freshContext(frozen.leaver, true);
  const [row] = await archive.withScope(
    actor,
    (tx) =>
      tx.$queryRaw`SELECT app.read_contribution_budget(${frozen.budgetId}::uuid,NULL,0) AS data`,
  );
  const page = contributionRawPageSchema.parse(row.data);
  requireContribution(
    page.view.budget.version === 2 &&
      page.view.budget.updatedAt === frozen.originalCreatedAt &&
      page.view.plans.length === 1 &&
      page.view.plans[0].priority === 1 &&
      page.view.plans[0].plan.monthlyContributions[0].amount.amountMinor ===
        "20",
  );
  const remaining = await freshContext(fixture.remaining);
  const [current] = await scoped.withScope(
    remaining,
    (tx) =>
      tx.$queryRaw`SELECT app.read_contribution_budget(${shared.budgetId}::uuid,NULL,0) AS data`,
  );
  const active = contributionRawPageSchema.parse(current.data);
  requireContribution(
    active.view.budget.version === 2 &&
      active.view.budget.updatedAt === shared.originalCreatedAt &&
      active.history.length === 2 &&
      active.view.plans[0].plan.monthlyContributions[0].amount.amountMinor ===
        "20",
  );
  const { rows: participants } = await owner.query(
    'SELECT "membershipId" FROM app."ContributionBudgetParticipant" WHERE "budgetId"=$1',
    [shared.budgetId],
  );
  requireContribution(
    participants.length === 1 &&
      participants[0].membershipId === fixture.remaining.membershipId,
  );
  return {
    contributionExclusivePurged: true,
    contributionFrozenArchive: true,
    contributionSharedRetained: true,
  };
}
