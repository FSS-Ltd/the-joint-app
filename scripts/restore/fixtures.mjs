import { Buffer } from "node:buffer";
import { DataVault } from "../../packages/database/dist/data-vault.js";
import { randomUUID } from "node:crypto";

/** Synthetic data is inserted only after the development dump reaches a clone. */
export async function seedRestoreFixture(client, recoveryKey) {
  const householdId = randomUUID(),
    neighborHouseholdId = randomUUID();
  const actor = () => ({
    userId: randomUUID(),
    membershipId: randomUUID(),
    sessionId: randomUUID(),
  });
  const deleted = actor(),
    remaining = actor(),
    leaver = actor(),
    neighbor = actor(),
    counterpart = actor();
  // A separate household proves deletion/leave cannot leak into a neighbor.
  const leavingHouseholdId = randomUUID();
  await client.query('INSERT INTO app."Household"(id) VALUES($1),($2),($3)', [
    householdId,
    leavingHouseholdId,
    neighborHouseholdId,
  ]);
  for (const [member, hh, slot] of [
    [deleted, householdId, 1],
    [remaining, householdId, 2],
    [leaver, leavingHouseholdId, 1],
    [counterpart, leavingHouseholdId, 2],
    [neighbor, neighborHouseholdId, 1],
  ]) {
    member.householdId = hh;
    await client.query('INSERT INTO app."User"(id) VALUES($1)', [
      member.userId,
    ]);
    await client.query(
      'INSERT INTO app."Membership"(id,"userId","householdId",slot) VALUES($1,$2,$3,$4)',
      [member.membershipId, member.userId, hh, slot],
    );
    await client.query(
      'INSERT INTO app."SessionRegistry"(id,"userId","householdId","expiresAt") VALUES($1,$2,$3,clock_timestamp()+interval \'1 hour\')',
      [member.sessionId, member.userId, hh],
    );
  }
  const accounts = {
    sole: randomUUID(),
    joint: randomUUID(),
    remaining: randomUUID(),
    archive: randomUUID(),
    neighbor: randomUUID(),
    formerlyViewed: randomUUID(),
  };
  async function account(id, creator, owners) {
    await client.query(
      'INSERT INTO app."Account"(id,"householdId","creatorUserId","creatorMembershipId",kind,label,"legalOwnerKind") VALUES($1,$2,$3,$4,\'CURRENT\',\'Synthetic restore source\',$5)',
      [
        id,
        creator.householdId,
        creator.userId,
        creator.membershipId,
        owners.length > 1 ? "JOINT_ADULT" : "ADULT",
      ],
    );
    for (const member of owners)
      await client.query(
        'INSERT INTO app."AccountOwner"("householdId","accountId","userId","membershipId") VALUES($1,$2,$3,$4)',
        [creator.householdId, id, member.userId, member.membershipId],
      );
    const transactionId = randomUUID();
    await client.query(
      'INSERT INTO app."Transaction"(id,"householdId","accountId","sourceNamespace","sourceId","sourceHash",fingerprint,"amountMinor","bookedDate",description,"updatedAt") VALUES($1,$2,$3,\'MANUAL\',$4,$5,$6,500,\'2026-10-01\',\'RESTORE_SECRET_SENTINEL\',clock_timestamp())',
      [
        transactionId,
        creator.householdId,
        id,
        randomUUID(),
        "a".repeat(64),
        "b".repeat(64),
      ],
    );
    return transactionId;
  }
  await account(accounts.sole, deleted, [deleted]);
  const jointTransactionId = await account(accounts.joint, deleted, [
    deleted,
    remaining,
  ]);
  await account(accounts.remaining, remaining, [remaining]);
  const archiveTransactionId = await account(accounts.archive, leaver, [
    leaver,
  ]);
  await account(accounts.neighbor, neighbor, [neighbor]);
  await account(accounts.formerlyViewed, counterpart, [counterpart]);
  await client.query(
    'INSERT INTO app."AccountGrant"("householdId","accountId","membershipId",level) VALUES($1,$2,$3,\'TRANSACTIONS\')',
    [leavingHouseholdId, accounts.formerlyViewed, leaver.membershipId],
  );
  await client.query(
    'INSERT INTO app."TransactionNote"("transactionId","householdId","accountId","authorUserId","authorMembershipId",body,"updatedAt") VALUES($1,$2,$3,$4,$5,\'Other archive author private note\',clock_timestamp())',
    [
      archiveTransactionId,
      leavingHouseholdId,
      accounts.archive,
      counterpart.userId,
      counterpart.membershipId,
    ],
  );

  // Recorded ownership, not this former grant, controls the eventual archive.
  await client.query(
    'INSERT INTO app."AccountGrant"("householdId","accountId","membershipId",level) VALUES($1,$2,$3,\'TRANSACTIONS\')',
    [householdId, accounts.remaining, deleted.membershipId],
  );
  for (const member of [deleted, remaining])
    await client.query(
      'INSERT INTO app."TransactionNote"("transactionId","householdId","accountId","authorUserId","authorMembershipId",body,"updatedAt") VALUES($1,$2,$3,$4,$5,$6,clock_timestamp())',
      [
        jointTransactionId,
        householdId,
        accounts.joint,
        member.userId,
        member.membershipId,
        member === deleted
          ? "Deleted author private note"
          : "Remaining author private note",
      ],
    );
  await client.query(
    'INSERT INTO app."AccountGrant"("householdId","accountId","membershipId",level) VALUES($1,$2,$3,\'TRANSACTIONS\')',
    [householdId, accounts.sole, remaining.membershipId],
  );
  await client.query(
    'INSERT INTO app."RequestKey"("userId",route,key,"payloadHash","resultCiphertext","expiresAt") VALUES($1,\'restore-proof\',$2,$3,$4,clock_timestamp()+interval \'1 day\')',
    [
      deleted.userId,
      randomUUID(),
      "1".repeat(64),
      new DataVault(recoveryKey).seal(
        Buffer.from("Synthetic private request replay"),
        `restore-request:${deleted.userId}`,
      ),
    ],
  );
  const scopeId = randomUUID(),
    budgetId = randomUUID();
  await client.query(
    'INSERT INTO app."BudgetScope"(id,"householdId","scopeHash","creatorMembershipId",ready) VALUES($1,$2,$3,$4,false)',
    [scopeId, householdId, "c".repeat(64), remaining.membershipId],
  );
  for (const id of [accounts.sole, accounts.joint])
    await client.query(
      'INSERT INTO app."BudgetScopeAccount"("householdId","scopeId","accountId") VALUES($1,$2,$3)',
      [householdId, scopeId, id],
    );
  await client.query('UPDATE app."BudgetScope" SET ready=true WHERE id=$1', [
    scopeId,
  ]);
  await client.query(
    'INSERT INTO app."Budget"(id,"householdId","scopeId",month,currency,"creatorMembershipId","updatedAt") VALUES($1,$2,$3,\'2026-10-01\',\'GBP\',$4,clock_timestamp())',
    [budgetId, householdId, scopeId, remaining.membershipId],
  );
  await client.query(
    'INSERT INTO app."BudgetLine"(id,"householdId","budgetId",category,"amountMinor") VALUES($1,$2,$3,\'Synthetic retained scope\',100)',
    [randomUUID(), householdId, budgetId],
  );
  await client.query(
    'INSERT INTO app."BudgetRevision"(id,"householdId","budgetId","actorMembershipId",version,data) VALUES($1,$2,$3,$4,1,\'{"synthetic":true}\')',
    [randomUUID(), householdId, budgetId, remaining.membershipId],
  );
  const importBatchId = randomUUID(),
    encryptedTransactionId = randomUUID();
  const plaintext =
    "date,description,amount\n2026-10-01,Encrypted restore fixture,123.45\n";
  const ciphertext = new DataVault(recoveryKey).seal(
    Buffer.from(plaintext),
    `import:${householdId}:${accounts.remaining}:${importBatchId}`,
  );
  await client.query(
    'INSERT INTO app."ImportBatch"(id,"householdId","accountId","requestedByUserId","requestedByMembershipId","fileChecksum","mappingHash",mapping,"parserVersion",state,"totalRows","processedRows","validRows","committedRows","previewExpiresAt","updatedAt","committedAt") VALUES($1,$2,$3,$4,$5,$6,$7,\'{}\',\'restore-synthetic-v1\',\'COMMITTED\',1,1,1,1,clock_timestamp()+interval \'1 day\',clock_timestamp(),clock_timestamp())',
    [
      importBatchId,
      householdId,
      accounts.remaining,
      remaining.userId,
      remaining.membershipId,
      "d".repeat(64),
      "e".repeat(64),
    ],
  );
  await client.query(
    'INSERT INTO app."ImportObject"("batchId","householdId","accountId",ciphertext,"expiresAt") VALUES($1,$2,$3,$4,clock_timestamp()+interval \'1 day\')',
    [importBatchId, householdId, accounts.remaining, ciphertext],
  );
  await client.query(
    'INSERT INTO app."Transaction"(id,"householdId","accountId","sourceNamespace","sourceId","sourceHash",fingerprint,"amountMinor","bookedDate",description,"originImportBatchId","csvRowNumber","updatedAt") VALUES($1,$2,$3,\'CSV\',$4,$5,$6,12345,\'2026-10-01\',\'Encrypted restore fixture\',$7,1,clock_timestamp())',
    [
      encryptedTransactionId,
      householdId,
      accounts.remaining,
      randomUUID(),
      "f".repeat(64),
      "a".repeat(64),
      importBatchId,
    ],
  );
  return {
    importBatchId,
    encryptedTransactionId,
    deleted,
    remaining,
    leaver,
    neighbor,
    accounts,
    scopeId,
    budgetId,
    jointTransactionId,
    archiveTransactionId,
    absentUserId: randomUUID(),
  };
}

export function fixtureIntents(fixture) {
  const base = (userId) => ({
    version: 1,
    eventId: randomUUID(),
    requestId: randomUUID(),
    userId,
    recordedAt: new Date().toISOString(),
  });
  return [
    { ...base(fixture.deleted.userId), kind: "DELETE_USER" },
    { ...base(fixture.absentUserId), kind: "DELETE_USER" },
    {
      ...base(fixture.leaver.userId),
      kind: "LEAVE_HOUSEHOLD",
      householdId: fixture.leaver.householdId,
    },
  ];
}
