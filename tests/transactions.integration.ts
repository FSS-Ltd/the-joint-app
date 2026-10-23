import { randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import type { AuthContext } from "../packages/contracts/dist/index.js";
import { createOrm } from "../packages/database/dist/client.js";
import { ScopedDatabase } from "../packages/database/dist/scoped-transaction.js";
import { IdentityVault } from "../apps/api/src/modules/identity/identity-vault.js";
import { TransactionMutations } from "../apps/api/src/modules/transactions/transaction-mutations.js";
import { TransactionAnnotations } from "../apps/api/src/modules/transactions/transaction-annotations.js";
import { TransactionQueries } from "../apps/api/src/modules/transactions/transaction-queries.js";
it("preserves manual revisions, owner classifications and author-private notes under real runtime RLS", async () => {
  if (!process.env.DATABASE_URL || !process.env.MIGRATION_DATABASE_URL)
    throw new Error("Local runtime and maintenance URLs required");
  const runtime = createOrm(process.env.DATABASE_URL),
    owner = createOrm(process.env.MIGRATION_DATABASE_URL);
  const householdId = randomUUID();
  const actor = (): AuthContext => ({
    householdId,
    userId: randomUUID(),
    membershipId: randomUUID(),
    sessionId: randomUUID(),
    requestId: randomUUID(),
    grantVersion: 0,
    aal: "aal2",
    mfaAuthenticatedAt: Date.now(),
  });
  const alice = actor(),
    partner = actor();
  const scoped = new ScopedDatabase(runtime);
  const key = Buffer.alloc(32, 9).toString("base64");
  const vault = new IdentityVault(key, key);
  const mutations = new TransactionMutations(scoped, vault),
    notes = new TransactionAnnotations(scoped),
    queries = new TransactionQueries(scoped, vault);
  try {
    await owner.household.create({ data: { id: householdId } });
    for (const [index, context] of [alice, partner].entries())
      await owner.user.create({
        data: {
          id: context.userId,
          memberships: {
            create: { id: context.membershipId, householdId, slot: index + 1 },
          },
          sessions: {
            create: {
              id: context.sessionId,
              householdId,
              expiresAt: new Date(Date.now() + 300_000),
            },
          },
        },
      });
    const account = await scoped.withScope(alice, (tx) =>
      tx.account.create({
        data: {
          householdId,
          creatorUserId: alice.userId,
          creatorMembershipId: alice.membershipId,
          kind: "CURRENT",
          label: "Synthetic transaction account",
          owners: {
            create: { userId: alice.userId, membershipId: alice.membershipId },
          },
        },
      }),
    );
    const input = {
      accountId: account.id,
      bookedDate: "2026-01-01",
      money: { amountMinor: "-450", currency: "GBP" as const },
      description: "Synthetic cafe",
    };
    const requestKey = randomUUID();
    let record = await mutations.create(alice, input, requestKey);
    expect((await mutations.create(alice, input, requestKey)).id).toBe(
      record.id,
    );
    await expect(
      mutations.create(alice, { ...input, description: "Changed" }, requestKey),
    ).rejects.toMatchObject({ status: 409 });
    await expect(queries.read(partner, record.id)).rejects.toMatchObject({
      status: 404,
    });
    await scoped.withScope(alice, (tx) =>
      tx.accountGrant.create({
        data: {
          householdId,
          accountId: account.id,
          membershipId: partner.membershipId,
          level: "TRANSACTIONS",
        },
      }),
    );
    record = await notes.annotate(
      alice,
      record.id,
      { category: "Food", note: "Owner private note", noteVersion: 0 },
      record.version,
    );
    expect((await queries.read(partner, record.id)).note.body).toBeNull();
    const theirs = await notes.annotate(
      partner,
      record.id,
      { note: "Partner private note", noteVersion: 0 },
      record.version,
    );
    expect(theirs.category).toBe("Food");
    expect((await queries.read(alice, record.id)).note.body).toBe(
      "Owner private note",
    );
    await expect(
      notes.annotate(
        partner,
        record.id,
        { category: "Forbidden" },
        record.version,
      ),
    ).rejects.toMatchObject({ status: 404 });
    const corrected = await mutations.patch(
      alice,
      record.id,
      {
        bookedDate: "2026-01-02",
        money: { amountMinor: "-500", currency: "GBP" },
        description: "Corrected synthetic cafe",
      },
      record.version,
    );
    expect(corrected.money.amountMinor).toBe("-500");
    await expect(
      mutations.patch(alice, record.id, { ...input }, record.version),
    ).rejects.toMatchObject({ status: 409 });
    const importBatch = await owner.importBatch.create({
      data: {
        householdId,
        accountId: account.id,
        requestedByUserId: alice.userId,
        requestedByMembershipId: alice.membershipId,
        fileChecksum: "a".repeat(64),
        mappingHash: "b".repeat(64),
        mapping: {},
        parserVersion: "test",
        state: "COMMITTING",
        previewExpiresAt: new Date(Date.now() + 60_000),
      },
    });
    await expect(
      mutations.create(alice, input, randomUUID()),
    ).rejects.toMatchObject({ status: 409 });
    await expect(
      mutations.patch(
        alice,
        record.id,
        {
          bookedDate: input.bookedDate,
          money: input.money,
          description: input.description,
        },
        corrected.version,
      ),
    ).rejects.toMatchObject({ status: 409 });
    expect((await mutations.create(alice, input, requestKey)).id).toBe(
      record.id,
    );
    await notes.annotate(
      alice,
      record.id,
      { note: "Private note during import", noteVersion: record.note.version },
      corrected.version,
    );
    await owner.importBatch.update({
      where: { id: importBatch.id },
      data: { state: "FAILED", committedRows: 1 },
    });
    await expect(
      mutations.create(alice, input, randomUUID()),
    ).rejects.toMatchObject({ status: 409 });
    await owner.importBatch.update({
      where: { id: importBatch.id },
      data: { state: "EXPIRED", committedRows: 0 },
    });
    const revisions = await owner.transactionRevision.findMany({
      where: { transactionId: record.id },
      orderBy: { version: "asc" },
    });
    expect(revisions.map((entry) => entry.kind)).toEqual([
      "CREATED",
      "CLASSIFICATION",
      "MANUAL_CORRECTION",
    ]);
    expect(JSON.stringify(revisions[0]?.data)).toContain("-450");
    await scoped.withScope(alice, (tx) =>
      tx.accountGrant.update({
        where: {
          accountId_membershipId: {
            accountId: account.id,
            membershipId: partner.membershipId,
          },
        },
        data: { level: "TOTALS" },
      }),
    );
    await expect(queries.read(partner, record.id)).rejects.toMatchObject({
      status: 404,
    });
  } finally {
    await owner.account.deleteMany({ where: { householdId } });
    await owner.household.deleteMany({ where: { id: householdId } });
    const ids = [alice.userId, partner.userId];
    await owner.requestKey.deleteMany({ where: { userId: { in: ids } } });
    await owner.auditEvent.deleteMany({ where: { userId: { in: ids } } });
    await owner.user.deleteMany({ where: { id: { in: ids } } });
    await runtime.$disconnect();
    await owner.$disconnect();
  }
});
