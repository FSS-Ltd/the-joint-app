import { randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import type { AuthContext } from "../packages/contracts/dist/index.js";
import { createOrm } from "../packages/database/dist/client.js";
import { ScopedDatabase } from "../packages/database/dist/scoped-transaction.js";
import { ReportService } from "../apps/api/src/modules/reports/report.service.js";
import { findScopedBudget } from "../apps/api/src/modules/budgets/budget-projection.js";
import { TransactionAnnotations } from "../apps/api/src/modules/transactions/transaction-annotations.js";
import { scopeHash } from "../apps/api/src/modules/reports/report-scope.js";
import { CategoriesService } from "../apps/api/src/modules/categories/category.service.js";

it("reports authorised booked cash flow, refunds, exact splits, coverage and hidden-scope isolation", async () => {
  if (!process.env.DATABASE_URL || !process.env.MIGRATION_DATABASE_URL)
    throw new Error("Local database URLs required");
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
  const scoped = new ScopedDatabase(runtime),
    reports = new ReportService(scoped),
    categories = new CategoriesService(scoped);
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
              expiresAt: new Date(Date.now() + 300000),
            },
          },
        },
      });
    const account = await owner.account.create({
      data: {
        householdId,
        creatorUserId: alice.userId,
        creatorMembershipId: alice.membershipId,
        kind: "CURRENT",
        label: "Synthetic visible",
        owners: {
          create: { userId: alice.userId, membershipId: alice.membershipId },
        },
      },
    });
    const hidden = await owner.account.create({
      data: {
        householdId,
        creatorUserId: partner.userId,
        creatorMembershipId: partner.membershipId,
        kind: "CURRENT",
        label: "Synthetic hidden",
        owners: {
          create: {
            userId: partner.userId,
            membershipId: partner.membershipId,
          },
        },
      },
    });
    const row = async (
      amount: bigint,
      kind: "EXPENSE" | "REFUND" | "TRANSFER" | null,
      date = "2026-01-10",
      category: string | null = "Food",
      accountId = account.id,
    ) =>
      owner.transaction.create({
        data: {
          householdId,
          accountId,
          sourceNamespace: "MANUAL",
          sourceId: randomUUID(),
          sourceHash: "a".repeat(64),
          fingerprint: "b".repeat(64),
          amountMinor: amount,
          bookedDate: new Date(date),
          description: "Synthetic report row",
          override:
            kind === null
              ? undefined
              : {
                  create: {
                    authorMembershipId:
                      accountId === account.id
                        ? alice.membershipId
                        : partner.membershipId,
                    classificationKind: kind,
                    category,
                  },
                },
        },
      });
    await row(-50000n, "TRANSFER");
    await row(50000n, "TRANSFER");
    await row(-12000n, "EXPENSE");
    await row(-12000n, "TRANSFER");
    await row(12000n, "TRANSFER");
    await row(-5000n, "EXPENSE");
    await row(5000n, "REFUND", "2026-02-10");
    const split = await row(-10000n, null);
    await owner.$transaction(async (tx) => {
      await tx.transactionSplit.createMany({
        data: [
          {
            householdId,
            accountId: account.id,
            transactionId: split.id,
            position: 0,
            amountMinor: -7000n,
            classificationKind: "EXPENSE",
            category: "Food",
          },
          {
            householdId,
            accountId: account.id,
            transactionId: split.id,
            position: 1,
            amountMinor: -3000n,
            classificationKind: "CONTRIBUTION",
            category: "Saving",
          },
        ],
      });
    });
    await row(-99999n, "EXPENSE", "2026-01-10", "Secret category", hidden.id);
    const pending = await row(-4000n, null);
    await owner.transaction.update({
      where: { id: pending.id },
      data: { status: "SUPERSEDED" },
    });
    let january = await reports.read(alice, "2026-01");
    expect(january.summary?.spending.amountMinor).toBe("24000");
    expect(january.summary?.netCash.amountMinor).toBe("-27000");
    expect(january.provenance.sourceRowCount).toBe(7);
    expect(january.coverage.complete).toBe(false);
    expect(january.coverage.reasons).toContain("MISSING_HISTORY");
    expect(january.scope.map((a) => a.id)).toEqual([account.id]);
    expect(JSON.stringify(january)).not.toContain("Secret");
    expect((await categories.list(alice)).items).not.toContain(
      "Secret category",
    );
    const key = january.scopeKey;
    await owner.account.update({
      where: { id: hidden.id },
      data: { version: { increment: 1 } },
    });
    expect((await reports.read(alice, "2026-01")).scopeKey).toBe(key);
    await expect(
      reports.read(alice, "2026-01", [hidden.id]),
    ).rejects.toMatchObject({ status: 404 });
    await owner.accountMonthCoverage.createMany({
      data: ["2026-01-01", "2026-02-01"].map((month) => ({
        householdId,
        accountId: account.id,
        month: new Date(month),
        complete: true,
        authorMembershipId: alice.membershipId,
      })),
    });
    january = await reports.read(alice, "2026-01");
    expect(january.coverage.complete).toBe(true);
    const february = await reports.read(alice, "2026-02");
    expect(february.summary?.spending.amountMinor).toBe("-5000");
    expect(february.comparison?.change.amountMinor).toBe("-29000");
    await owner.accountGrant.create({
      data: {
        householdId,
        accountId: account.id,
        membershipId: partner.membershipId,
        level: "TOTALS",
      },
    });
    await expect(
      reports.read(partner, "2026-01", [account.id]),
    ).rejects.toMatchObject({ status: 404 });
    await owner.account.update({
      where: { id: hidden.id },
      data: { archivedAt: new Date() },
    });
    const empty = await reports.read(partner, "2026-01");
    expect(empty.summary).toBeNull();
    expect(empty.trend).toEqual([]);
    expect(empty.coverage.reasons).toContain("NO_ACCOUNTS");
    await owner.account.update({
      where: { id: hidden.id },
      data: { archivedAt: null },
    });
    await owner.accountGrant.update({
      where: {
        accountId_membershipId: {
          accountId: account.id,
          membershipId: partner.membershipId,
        },
      },
      data: { level: "TRANSACTIONS" },
    });
    expect(
      (await reports.read(partner, "2026-01", [account.id])).summary?.spending
        .amountMinor,
    ).toBe("24000");
    const beforePrivateNote = await reports.read(alice, "2026-01");
    await new TransactionAnnotations(scoped).annotate(
      partner,
      split.id,
      { note: "Synthetic private partner note", noteVersion: 0 },
      1,
    );
    expect((await reports.read(alice, "2026-01")).scopeKey).toBe(
      beforePrivateNote.scopeKey,
    );
    const start = performance.now();
    await owner.$executeRaw`INSERT INTO app."Transaction" (id,"householdId","accountId",currency,"sourceNamespace","sourceId","sourceHash",fingerprint,"amountMinor","bookedDate",description,status,version,"createdAt","updatedAt") SELECT gen_random_uuid(),${householdId}::uuid,${account.id}::uuid,'GBP','MANUAL','synthetic-bulk-'||g,'cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc','dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd',-9223372036854775808,'2026-03-01'::date,'Synthetic large report','BOOKED',1,now(),now() FROM generate_series(1,50000) g`;
    const readStart = performance.now();
    const large = await reports.read(alice, "2026-03", [account.id]);
    expect(performance.now() - readStart).toBeLessThan(5000);
    expect(large.summary?.spending.amountMinor).toBe(
      "461168601842738790400000",
    );
    expect(large.provenance.sourceRowCount).toBe(50000);
    expect(large.summary?.unreviewedCount).toBe(50000);
    expect(performance.now() - start).toBeLessThan(15000);
    const bulkRows = await owner.transaction.findMany({
      where: {
        householdId,
        accountId: account.id,
        sourceId: { startsWith: "synthetic-bulk-" },
      },
      select: { id: true, sourceId: true },
    });
    for (let offset = 0; offset < bulkRows.length; offset += 500) {
      await owner.$transaction(async (tx) => {
        // This synthetic jump from a tiny table to 50,000 rows must not reuse
        // the maintenance connection's earlier tiny-table trigger/FK plans.
        // Runtime report connections and every database limit stay unchanged.
        await tx.$executeRaw`DISCARD PLANS`;
        await tx.transactionOverride.createMany({
          data: bulkRows.slice(offset, offset + 500).map((t) => ({
            transactionId: t.id,
            householdId,
            accountId: account.id,
            authorMembershipId: alice.membershipId,
            classificationKind: "EXPENSE",
            category:
              t.sourceId === "synthetic-bulk-1"
                ? "Zebra retained budget"
                : `Category ${Number(t.sourceId.slice(15)) % 105}`,
          })),
        });
      });
    }
    const budgetScope = await scoped.withScope(alice, async (tx) => {
      const created = await tx.budgetScope.create({
        data: {
          householdId,
          creatorMembershipId: alice.membershipId,
          scopeHash: scopeHash([account.id]),
          ready: false,
          accounts: { create: { accountId: account.id } },
        },
      });
      await tx.$queryRaw`SELECT app.publish_budget_scope(${created.id}::uuid)`;
      return created;
    });
    await owner.budget.create({
      data: {
        householdId,
        scopeId: budgetScope.id,
        month: new Date("2026-03-01"),
        creatorMembershipId: alice.membershipId,
        lines: {
          create: { category: "Zebra retained budget", amountMinor: 1000n },
        },
      },
    });
    // Reuse this exact 50,000-row fixture for the lower-level RLS join check,
    // avoiding a competing bulk fixture without removing either acceptance case.
    const grouped = await scoped.withScope(
      alice,
      (tx) => tx.$queryRaw<
        { total: string; count: bigint }[]
      >`SELECT sum(t."amountMinor"::numeric)::text AS total,count(*) AS count
      FROM app."Transaction" t JOIN app."TransactionOverride" o ON o."transactionId"=t.id
      WHERE t."householdId"=${householdId}::uuid AND t."accountId"=${account.id}::uuid
      AND t."bookedDate">='2026-03-01'::date AND t."bookedDate"<'2026-04-01'::date`,
    );
    expect(grouped).toEqual([
      { total: "-461168601842738790400000", count: 50000n },
    ]);
    const classifiedStart = performance.now();
    const classified = await reports.read(alice, "2026-03", [account.id]);
    expect(performance.now() - classifiedStart).toBeLessThan(5000);
    expect(classified.summary?.spending.amountMinor).toBe(
      "461168601842738790400000",
    );
    expect(classified.summary?.unreviewedCount).toBe(0);
    expect(classified.summary?.categories.some((c) => c.grouped)).toBe(true);
    expect(
      classified.summary?.categories.find(
        (c) => c.category === "Zebra retained budget" && !c.grouped,
      )?.count,
    ).toBe(1);
    expect(
      classified.summary?.categories.reduce((sum, c) => sum + c.count, 0),
    ).toBe(50000);
    expect(classified.budget?.lines[0]?.category).toBe("Zebra retained budget");
    await owner.accountGrant.create({
      data: {
        householdId,
        accountId: hidden.id,
        membershipId: alice.membershipId,
        level: "TRANSACTIONS",
      },
    });
    const pairedScope = await scoped.withScope(alice, async (tx) => {
      const created = await tx.budgetScope.create({
        data: {
          householdId,
          creatorMembershipId: alice.membershipId,
          scopeHash: scopeHash([account.id, hidden.id]),
          accounts: {
            create: [{ accountId: account.id }, { accountId: hidden.id }],
          },
        },
      });
      await tx.$queryRaw`SELECT app.publish_budget_scope(${created.id}::uuid)`;
      return created;
    });
    await owner.budget.create({
      data: {
        householdId,
        scopeId: pairedScope.id,
        month: new Date("2026-02-01"),
        creatorMembershipId: alice.membershipId,
        lines: { create: { category: "", amountMinor: 1000n } },
      },
    });
    expect(
      (
        await scoped.withScope(alice, (tx) =>
          findScopedBudget(tx, alice, "2026-02", [account.id, hidden.id]),
        )
      )?.lines[0]?.category,
    ).toBeNull();
    await owner.accountGrant.update({
      where: {
        accountId_membershipId: {
          accountId: hidden.id,
          membershipId: alice.membershipId,
        },
      },
      data: { level: "TOTALS" },
    });
    expect(
      await scoped.withScope(alice, (tx) =>
        findScopedBudget(tx, alice, "2026-02", [account.id, hidden.id]),
      ),
    ).toBeNull();
    await expect(
      reports.read(alice, "2026-02", [account.id, hidden.id]),
    ).rejects.toMatchObject({ status: 404 });
    const extras = Array.from({ length: 50 }, () => ({
      id: randomUUID(),
      householdId,
      creatorUserId: alice.userId,
      creatorMembershipId: alice.membershipId,
      label: "Synthetic selection limit",
      kind: "CURRENT" as const,
    }));
    await owner.account.createMany({ data: extras });
    await owner.accountOwner.createMany({
      data: extras.map((a) => ({
        householdId,
        accountId: a.id,
        userId: alice.userId,
        membershipId: alice.membershipId,
      })),
    });
    await expect(reports.read(alice, "2026-01")).rejects.toMatchObject({
      status: 400,
    });
  } finally {
    await owner.budgetScope.deleteMany({ where: { householdId } });
    await owner.account.deleteMany({ where: { householdId } });
    await owner.household.deleteMany({ where: { id: householdId } });
    await owner.auditEvent.deleteMany({
      where: { userId: { in: [alice.userId, partner.userId] } },
    });
    await owner.requestKey.deleteMany({
      where: { userId: { in: [alice.userId, partner.userId] } },
    });
    await owner.user.deleteMany({
      where: { id: { in: [alice.userId, partner.userId] } },
    });
    await runtime.$disconnect();
    await owner.$disconnect();
  }
}, 60000);
