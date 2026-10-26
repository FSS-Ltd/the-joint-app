import { randomUUID } from "node:crypto";

const schedule = (amountMinor) => ({
  firstContributionDate: "2026-11-30",
  monthlyContributions: [
    { fromMonth: 1, amount: { amountMinor, currency: "GBP" } },
  ],
});
async function group(client, count) {
  const householdId = randomUUID(),
    members = [];
  await client.query('INSERT INTO app."Household"(id) VALUES($1)', [
    householdId,
  ]);
  for (let index = 0; index < count; index += 1) {
    const member = {
      userId: randomUUID(),
      membershipId: randomUUID(),
      householdId,
    };
    await client.query('INSERT INTO app."User"(id) VALUES($1)', [
      member.userId,
    ]);
    await client.query(
      'INSERT INTO app."Membership"(id,"userId","householdId",slot) VALUES($1,$2,$3,$4)',
      [member.membershipId, member.userId, householdId, index + 1],
    );
    members.push(member);
  }
  const goalId = randomUUID();
  await client.query(
    'INSERT INTO app."Goal"(id,"householdId",name,priority,"targetMinor") VALUES($1,$2,\'Synthetic contribution restore\',1,100)',
    [goalId, householdId],
  );
  for (const member of members)
    await client.query(
      'INSERT INTO app."GoalParticipant"("householdId","goalId","membershipId") VALUES($1,$2,$3)',
      [householdId, goalId, member.membershipId],
    );
  return { householdId, goalId, members };
}
async function plan(client, budget, amount, version, expectedBudgetVersion) {
  const input = schedule(amount);
  const {
    rows: [row],
  } = await client.query(
    "SELECT app.contribution_plan_entry($1::uuid,$2::uuid,$3::integer,$4::jsonb) AS entry",
    [budget.goalId, budget.planId, version, JSON.stringify(input)],
  );
  const {
    rows: [revision],
  } = await client.query(
    "SELECT app.record_contribution_revision($1::uuid,$2::integer,$3::uuid,$4::jsonb) AS version",
    [
      budget.budgetId,
      expectedBudgetVersion,
      budget.goalId,
      JSON.stringify({ kind: "PLAN", entry: row.entry }),
    ],
  );
  if (version === 1) {
    await client.query(
      'INSERT INTO app."ContributionPlan"(id,"householdId","goalId",version,"firstContributionDate","budgetId","sourceVersion") VALUES($1,$2,$3,$4,$5::date,$6,$7)',
      [
        budget.planId,
        budget.householdId,
        budget.goalId,
        version,
        input.firstContributionDate,
        budget.budgetId,
        revision.version,
      ],
    );
  } else {
    await client.query(
      'UPDATE app."ContributionPlan" SET version=$2,"sourceVersion"=$3 WHERE id=$1',
      [budget.planId, version, revision.version],
    );
    await client.query('DELETE FROM app."ContributionStep" WHERE "planId"=$1', [
      budget.planId,
    ]);
  }
  await client.query(
    'INSERT INTO app."ContributionStep"(id,"householdId","planId","fromMonth","amountMinor") VALUES($1,$2,$3,1,$4::bigint)',
    [randomUUID(), budget.householdId, budget.planId, amount],
  );
}
async function capacityBudget(client, householdId, goalId, members) {
  const record = {
    budgetId: randomUUID(),
    planId: randomUUID(),
    householdId,
    goalId,
  };
  await client.query(
    'INSERT INTO app."ContributionBudget"(id,"householdId") VALUES($1,$2)',
    [record.budgetId, householdId],
  );
  for (const member of members)
    await client.query(
      'INSERT INTO app."ContributionBudgetParticipant"("householdId","budgetId","membershipId") VALUES($1,$2,$3)',
      [householdId, record.budgetId, member.membershipId],
    );
  await client.query(
    "SELECT app.record_contribution_revision($1::uuid,0,NULL::uuid,$2::jsonb)",
    [
      record.budgetId,
      JSON.stringify({
        kind: "CAPACITY",
        capacity: { ...schedule("500"), horizonMonths: 12 },
      }),
    ],
  );
  return record;
}
async function budget(client, householdId, goalId, members) {
  const record = await capacityBudget(client, householdId, goalId, members);
  await plan(client, record, "20", 1, 1);
  const {
    rows: [head],
  } = await client.query(
    'SELECT "updatedAt" FROM app."ContributionBudget" WHERE id=$1',
    [record.budgetId],
  );
  return { ...record, originalCreatedAt: head.updatedAt.toISOString() };
}

async function lateParticipantBudget(client) {
  const solo = await group(client, 1),
    leaver = solo.members[0];
  const record = await capacityBudget(
    client,
    solo.householdId,
    solo.goalId,
    solo.members,
  );
  const deleted = {
    userId: randomUUID(),
    membershipId: randomUUID(),
    householdId: solo.householdId,
  };
  await client.query('INSERT INTO app."User"(id) VALUES($1)', [deleted.userId]);
  await client.query(
    'INSERT INTO app."Membership"(id,"userId","householdId",slot) VALUES($1,$2,$3,2)',
    [deleted.membershipId, deleted.userId, solo.householdId],
  );
  record.goalId = randomUUID();
  await client.query(
    'INSERT INTO app."Goal"(id,"householdId",name,priority,"targetMinor") VALUES($1,$2,\'Synthetic later shared goal\',1,100)',
    [record.goalId, record.householdId],
  );
  for (const member of [leaver, deleted])
    await client.query(
      'INSERT INTO app."GoalParticipant"("householdId","goalId","membershipId") VALUES($1,$2,$3)',
      [record.householdId, record.goalId, member.membershipId],
    );
  await plan(client, record, "20", 1, 1);
  const {
    rows: [head],
  } = await client.query(
    'SELECT "updatedAt" FROM app."ContributionBudget" WHERE id=$1',
    [record.budgetId],
  );
  await client.query(
    "SELECT app.exit_household_member($1::uuid,$2::uuid,$3::uuid)",
    [leaver.userId, leaver.householdId, leaver.membershipId],
  );
  await client.query(
    'UPDATE app."Goal" SET priority=3,version=version+1 WHERE id=$1',
    [record.goalId],
  );
  return {
    ...record,
    leaver,
    deleted,
    originalCreatedAt: head.updatedAt.toISOString(),
  };
}

export async function seedContributionRestoreFixture(client, adults, goals) {
  const solo = await group(client, 1),
    frozenGroup = await group(client, 2);
  const exclusive = await budget(
    client,
    solo.householdId,
    solo.goalId,
    solo.members,
  );
  const frozen = await budget(
    client,
    frozenGroup.householdId,
    frozenGroup.goalId,
    frozenGroup.members,
  );
  const [leaver, deleted] = frozenGroup.members;
  await client.query(
    "SELECT app.exit_household_member($1::uuid,$2::uuid,$3::uuid)",
    [leaver.userId, leaver.householdId, leaver.membershipId],
  );
  await plan(client, frozen, "30", 2, 2);
  await client.query(
    'UPDATE app."Goal" SET priority=3,version=version+1 WHERE id=$1',
    [frozen.goalId],
  );
  const shared = await budget(
    client,
    adults.remaining.householdId,
    goals.sharedGoalId,
    [adults.deleted, adults.remaining],
  );
  const outsider = await lateParticipantBudget(client);
  return {
    outsider,
    exclusive: { ...exclusive, deleted: solo.members[0] },
    frozen: { ...frozen, leaver, deleted },
    shared,
  };
}
