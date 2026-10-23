function requireGoalProof(value) {
  if (!value) throw new Error("Restored goal privacy verification failed");
}
export async function verifyRestoredGoals(
  owner,
  scoped,
  archive,
  freshContext,
  fixture,
) {
  const goals = fixture.goals;
  const row = async (sql, args) => (await owner.query(sql, args)).rows[0];
  requireGoalProof(
    !(await row('SELECT 1 FROM app."Goal" WHERE id=$1', [
      goals.exclusiveGoalId,
    ])),
  );
  requireGoalProof(
    !(await row(
      'SELECT 1 FROM app."GoalParticipant" p JOIN app."Membership" m ON m.id=p."membershipId" WHERE m."userId"=$1',
      [goals.deleted.userId],
    )),
  );
  const head = await row(
    'SELECT name,version,"targetMinor"::text AS amount FROM app."Goal" WHERE id=$1',
    [goals.frozenGoalId],
  );
  requireGoalProof(
    head?.name === "Synthetic retained goal" &&
      head.version === 1 &&
      head.amount === "100",
  );
  const revisions = (
    await owner.query(
      'SELECT version,"createdAt" FROM app."GoalRevision" WHERE "goalId"=$1 ORDER BY version',
      [goals.frozenGoalId],
    )
  ).rows;
  requireGoalProof(
    revisions.length === 1 &&
      revisions[0].version === 1 &&
      revisions[0].createdAt.toISOString() === goals.originalCreatedAt,
  );
  const frozen = await freshContext(goals.frozen, true);
  const [page] = await archive.withScope(
    frozen,
    (tx) =>
      tx.$queryRaw`SELECT app.read_goal(${goals.frozenGoalId}::uuid,0) AS data`,
  );
  requireGoalProof(
    page.data.goal.version === 1 &&
      page.data.revisions.length === 1 &&
      page.data.revisions[0].createdAt === goals.originalCreatedAt,
  );
  const remaining = await freshContext(fixture.remaining);
  const [shared] = await scoped.withScope(
    remaining,
    (tx) =>
      tx.$queryRaw`SELECT app.read_goal(${goals.sharedGoalId}::uuid,0) AS data`,
  );
  requireGoalProof(
    shared.data.goal.name === "Synthetic independently shared goal",
  );
  return {
    goalPrivacyPurged: true,
    goalFrozenArchive: true,
    goalSharedRetained: true,
  };
}
