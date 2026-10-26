import { goalAllocationRawPageSchema } from "../../packages/contracts/dist/index.js";

function requireAllocationProof(value) {
  if (!value)
    throw new Error("Restored allocation privacy verification failed");
}
export async function verifyRestoredAllocations(
  owner,
  scoped,
  archive,
  freshContext,
  fixture,
) {
  const f = fixture.allocations;
  for (const table of [
    "AccountAllocationState",
    "AccountAllocationRevision",
    "GoalAllocation",
  ]) {
    const { rows } = await owner.query(
      `SELECT 1 FROM app."${table}" WHERE "accountId"=$1`,
      [fixture.accounts.sole],
    );
    requireAllocationProof(rows.length === 0);
  }
  const { rows: revisions } = await owner.query(
    'SELECT version,"createdAt" FROM app."AccountAllocationRevision" WHERE "accountId"=$1 ORDER BY version',
    [f.accountId],
  );
  requireAllocationProof(
    revisions.length === 1 &&
      revisions[0].version === 1 &&
      revisions[0].createdAt.toISOString() === f.originalCreatedAt,
  );
  const {
    rows: [state],
  } = await owner.query(
    'SELECT version,"updatedAt" FROM app."AccountAllocationState" WHERE "accountId"=$1',
    [f.accountId],
  );
  requireAllocationProof(
    state.version === 1 &&
      state.updatedAt.toISOString() === f.originalCreatedAt,
  );
  const frozen = await freshContext(f.frozen, true);
  const [archived] = await archive.withScope(
    frozen,
    (tx) =>
      tx.$queryRaw`SELECT app.read_goal_allocations(${f.frozenGoalId}::uuid,ARRAY[${f.accountId}::uuid],NULL) AS data`,
  );
  const page = goalAllocationRawPageSchema.parse(archived.data);
  requireAllocationProof(
    page.history.length === 1 &&
      page.history[0].createdAt === f.originalCreatedAt &&
      page.view.allocations[0].amount.amountMinor === "20" &&
      page.view.positions[0].status === "UNAVAILABLE",
  );
  const remaining = await freshContext(fixture.remaining);
  const [active] = await scoped.withScope(
    remaining,
    (tx) =>
      tx.$queryRaw`SELECT app.read_goal_allocations(${fixture.goals.sharedGoalId}::uuid,ARRAY[${fixture.accounts.joint}::uuid],NULL) AS data`,
  );
  const shared = goalAllocationRawPageSchema.parse(active.data);
  requireAllocationProof(
    shared.history.length === 1 &&
      shared.history[0].createdAt === f.jointCreatedAt &&
      shared.view.allocations[0].amount.amountMinor === "20",
  );
  return {
    allocationExclusivePurged: true,
    allocationFrozenArchive: true,
    allocationJointRetained: true,
  };
}
