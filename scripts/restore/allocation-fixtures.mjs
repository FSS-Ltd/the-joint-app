import { randomUUID } from "node:crypto";

export async function seedAllocationRestoreFixture(
  client,
  adults,
  accounts,
  goals,
) {
  async function goal(householdId, participants) {
    const id = randomUUID();
    await client.query(
      'INSERT INTO app."Goal"(id,"householdId",name,priority,"targetMinor") VALUES($1,$2,\'Synthetic allocation restore\',1,100)',
      [id, householdId],
    );
    for (const member of participants)
      await client.query(
        'INSERT INTO app."GoalParticipant"("householdId","goalId","membershipId") VALUES($1,$2,$3)',
        [householdId, id, member.membershipId],
      );
    return id;
  }
  async function record(accountId, goalId, valuationId, amountMinor) {
    await client.query(
      "SELECT app.record_goal_allocation($1::uuid,$2::uuid,$3::jsonb)",
      [
        accountId,
        goalId,
        JSON.stringify({
          basis: "FIXED",
          accountId,
          valuationId,
          amount: { amountMinor, currency: "GBP" },
        }),
      ],
    );
  }
  const householdId = randomUUID(),
    accountId = randomUUID(),
    valuationId = randomUUID();
  const actor = () => ({
    userId: randomUUID(),
    membershipId: randomUUID(),
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
  await client.query(
    'INSERT INTO app."Account"(id,"householdId","creatorUserId","creatorMembershipId",kind,label,"legalOwnerKind") VALUES($1,$2,$3,$4,\'SAVINGS\',\'Synthetic allocation source\',\'JOINT_ADULT\')',
    [accountId, householdId, deleted.userId, deleted.membershipId],
  );
  for (const member of [frozen, deleted])
    await client.query(
      'INSERT INTO app."AccountOwner"("householdId","accountId","userId","membershipId") VALUES($1,$2,$3,$4)',
      [householdId, accountId, member.userId, member.membershipId],
    );
  await client.query(
    'INSERT INTO app."BalanceSnapshot"(id,"householdId","accountId","authorMembershipId","amountMinor","adultAmountMinor","asOfDate") VALUES($1,$2,$3,$4,100,100,(clock_timestamp() AT TIME ZONE \'Europe/London\')::date)',
    [valuationId, householdId, accountId, deleted.membershipId],
  );
  await client.query(
    'INSERT INTO app."FundingEvidence"("householdId","accountId","valuationId","authorMembershipId",version,"settledAdultAmountMinor","billReservesMinor") VALUES($1,$2,$3,$4,1,100,0)',
    [householdId, accountId, valuationId, deleted.membershipId],
  );
  const frozenGoalId = await goal(householdId, [frozen, deleted]);
  await record(accountId, frozenGoalId, valuationId, "20");
  const {
    rows: [original],
  } = await client.query(
    'SELECT "createdAt" FROM app."AccountAllocationRevision" WHERE "accountId"=$1 AND version=1',
    [accountId],
  );
  await client.query(
    "SELECT app.exit_household_member($1::uuid,$2::uuid,$3::uuid)",
    [frozen.userId, householdId, frozen.membershipId],
  );
  await record(accountId, frozenGoalId, valuationId, "30");
  const exclusiveGoalId = await goal(adults.deleted.householdId, [
    adults.deleted,
  ]);
  for (const [sourceId, goalId] of [
    [accounts.sole, exclusiveGoalId],
    [accounts.joint, goals.sharedGoalId],
  ]) {
    const {
      rows: [v],
    } = await client.query(
      'SELECT "valuationId" FROM app."FundingEvidence" WHERE "accountId"=$1 ORDER BY version DESC LIMIT 1',
      [sourceId],
    );
    await record(sourceId, goalId, v.valuationId, "20");
  }
  const {
    rows: [joint],
  } = await client.query(
    'SELECT "createdAt" FROM app."AccountAllocationRevision" WHERE "accountId"=$1 AND version=1',
    [accounts.joint],
  );
  return {
    frozen,
    deleted,
    accountId,
    valuationId,
    frozenGoalId,
    exclusiveGoalId,
    originalCreatedAt: original.createdAt.toISOString(),
    jointCreatedAt: joint.createdAt.toISOString(),
  };
}
