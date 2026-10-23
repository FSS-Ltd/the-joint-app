import { randomUUID } from "node:crypto";

export async function seedGoalRestoreFixture(client, sharedAdults) {
  const householdId = randomUUID();
  const actor = () => ({
    userId: randomUUID(),
    membershipId: randomUUID(),
    sessionId: randomUUID(),
    householdId,
  });
  const frozen = actor(),
    deleted = actor();
  await client.query('INSERT INTO app."Household"(id) VALUES($1)', [
    householdId,
  ]);
  for (const [i, member] of [frozen, deleted].entries()) {
    await client.query('INSERT INTO app."User"(id) VALUES($1)', [
      member.userId,
    ]);
    await client.query(
      'INSERT INTO app."Membership"(id,"userId","householdId",slot) VALUES($1,$2,$3,$4)',
      [member.membershipId, member.userId, householdId, i + 1],
    );
  }
  async function goal(hh, participants, name) {
    const id = randomUUID();
    await client.query(
      'INSERT INTO app."Goal"(id,"householdId",name,priority,"targetMinor") VALUES($1,$2,$3,1,100)',
      [id, hh, name],
    );
    for (const member of participants)
      await client.query(
        'INSERT INTO app."GoalParticipant"("householdId","goalId","membershipId") VALUES($1,$2,$3)',
        [hh, id, member.membershipId],
      );
    return id;
  }
  const frozenGoalId = await goal(
    householdId,
    [frozen, deleted],
    "Synthetic retained goal",
  );
  const {
    rows: [original],
  } = await client.query(
    'SELECT "createdAt" FROM app."GoalRevision" WHERE "goalId"=$1 AND version=1',
    [frozenGoalId],
  );
  await client.query(
    "SELECT app.exit_household_member($1::uuid,$2::uuid,$3::uuid)",
    [frozen.userId, householdId, frozen.membershipId],
  );
  await client.query(
    'UPDATE app."Goal" SET name=\'Synthetic post-exit private target\',"targetMinor"=999999,version=version+1 WHERE id=$1',
    [frozenGoalId],
  );
  const exclusiveGoalId = await goal(
    householdId,
    [deleted],
    "Synthetic exclusive goal",
  );
  const sharedGoalId = await goal(
    sharedAdults.remaining.householdId,
    [sharedAdults.deleted, sharedAdults.remaining],
    "Synthetic independently shared goal",
  );
  return {
    frozen,
    deleted,
    frozenGoalId,
    exclusiveGoalId,
    sharedGoalId,
    originalCreatedAt: original.createdAt.toISOString(),
  };
}
