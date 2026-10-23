import { randomUUID } from "node:crypto";

export async function seedFundingRestoreFixture(client, adults, accounts) {
  async function valuation(accountId, actor) {
    const id = randomUUID();
    await client.query(
      'INSERT INTO app."BalanceSnapshot"(id,"householdId","accountId","authorMembershipId","amountMinor","adultAmountMinor","asOfDate") VALUES($1,$2,$3,$4,100,100,(statement_timestamp() AT TIME ZONE \'Europe/London\')::date)',
      [id, actor.householdId, accountId, actor.membershipId],
    );
    return id;
  }
  async function evidence(accountId, valuationId, actor, version, reserves) {
    const {
      rows: [row],
    } = await client.query(
      'INSERT INTO app."FundingEvidence"("householdId","accountId","valuationId","authorMembershipId",version,"settledAdultAmountMinor","billReservesMinor") VALUES($1,$2,$3,$4,$5,100,$6) RETURNING id,"createdAt"',
      [
        actor.householdId,
        accountId,
        valuationId,
        actor.membershipId,
        version,
        reserves,
      ],
    );
    return { id: row.id, createdAt: row.createdAt.toISOString() };
  }
  await evidence(
    accounts.sole,
    await valuation(accounts.sole, adults.deleted),
    adults.deleted,
    1,
    5,
  );
  const joint = await evidence(
    accounts.joint,
    await valuation(accounts.joint, adults.deleted),
    adults.deleted,
    1,
    10,
  );
  const householdId = randomUUID(),
    accountId = randomUUID();
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
    'INSERT INTO app."Account"(id,"householdId","creatorUserId","creatorMembershipId",kind,label,"legalOwnerKind") VALUES($1,$2,$3,$4,\'CURRENT\',\'Synthetic frozen funding\',\'JOINT_ADULT\')',
    [accountId, householdId, deleted.userId, deleted.membershipId],
  );
  for (const member of [frozen, deleted])
    await client.query(
      'INSERT INTO app."AccountOwner"("householdId","accountId","userId","membershipId") VALUES($1,$2,$3,$4)',
      [householdId, accountId, member.userId, member.membershipId],
    );
  const source = await valuation(accountId, deleted),
    original = await evidence(accountId, source, deleted, 1, 15);
  await client.query(
    "SELECT app.exit_household_member($1::uuid,$2::uuid,$3::uuid)",
    [frozen.userId, householdId, frozen.membershipId],
  );
  await evidence(accountId, source, deleted, 2, 99999);
  return { frozen, deleted, accountId, original, joint };
}
