import { createHash } from "node:crypto";
import { ConflictException } from "@nestjs/common";
import {
  spendingReportSchema,
  type AuthContext,
  type SpendingReport,
} from "@joint/contracts";
import type { ScopedDatabase } from "@joint/database/scoped";
import {
  assessCoverage,
  monthBounds,
  previousMonths,
  summariseSpending,
} from "@joint/domain/cash-flow";
import { londonToday } from "@joint/domain/transactions";
import { findScopedBudget } from "../budgets/budget-projection.js";
import { resolveReportScope } from "./report-scope.js";
import { reportComponents, reportProvenance } from "./report-components.js";
const digest = (input: unknown) =>
  createHash("sha256").update(JSON.stringify(input)).digest("hex");
export class ReportService {
  constructor(private readonly database: ScopedDatabase) {}
  async read(
    context: AuthContext,
    month: string,
    accountIds?: readonly string[],
  ): Promise<SpendingReport> {
    return this.database.withScope(context, async (tx) => {
      const scope = await resolveReportScope(tx, context, accountIds),
        ids = scope.map((a) => a.id),
        bounds = monthBounds(month),
        today = londonToday();
      const permissionKey = digest([
        context.userId,
        context.membershipId,
        context.grantVersion,
      ]);
      const budget = await findScopedBudget(tx, context, month, ids);
      const historyCount = Math.min(
        6,
        (Number(month.slice(0, 4)) - 1) * 12 + Number(month.slice(5)),
      );
      const months = previousMonths(month, historyCount),
        first = months[0] ?? month;
      const coverage = ids.length
        ? await tx.accountMonthCoverage.findMany({
            where: {
              householdId: context.householdId,
              accountId: { in: ids },
              month: {
                gte: new Date(`${first}-01`),
                lte: new Date(bounds.start),
              },
            },
            orderBy: [{ accountId: "asc" }, { month: "asc" }],
            select: {
              accountId: true,
              month: true,
              complete: true,
              version: true,
              updatedAt: true,
            },
          })
        : [];
      const components = ids.length
        ? await reportComponents(
            tx,
            context,
            scope,
            monthBounds(first).start,
            bounds.endExclusive,
            budget?.lines.map((l) => l.category) ?? [],
          )
        : [];
      const summaries = new Map(
        months.map((period) => [
          period,
          summariseSpending(components.filter((row) => row.month === period)),
        ]),
      );
      const assess = (period: string) => {
        const summary = summaries.get(period);
        return assessCoverage({
          month: period,
          today,
          accountCount: ids.length,
          attestedAccountCount: coverage.filter(
            (row) =>
              row.month.toISOString().slice(0, 7) === period && row.complete,
          ).length,
          unreviewedCount: summary?.unreviewedCount ?? 0,
          unclassifiedCount: summary?.unclassifiedCount ?? 0,
          unknownDebtCount: summary?.unknownDebtCount ?? 0,
        });
      };
      const assessed = assess(month),
        summary = summaries.get(month) ?? null;
      const provenance = ids.length
        ? await reportProvenance(
            tx,
            context,
            ids,
            bounds.start,
            bounds.endExclusive,
          )
        : { latestRecordDate: null, sourceRowCount: 0n };
      const again = await resolveReportScope(tx, context, accountIds),
        budgetAgain = await findScopedBudget(tx, context, month, ids);
      const [valid] = await tx.$queryRaw<
        { valid: boolean }[]
      >`SELECT app.scope_is_valid() AS valid`;
      if (
        !valid?.valid ||
        digest(scope) !== digest(again) ||
        budgetAgain?.id !== budget?.id ||
        budgetAgain?.version !== budget?.version
      )
        throw new ConflictException({ error: { code: "SCOPE_CHANGED" } });
      const previous = months.at(-2),
        previousSummary = previous ? summaries.get(previous) : undefined;
      const comparison =
        previous &&
        previousSummary &&
        summary &&
        assessed.complete &&
        assess(previous).complete
          ? {
              previousMonth: previous,
              change: {
                amountMinor: (
                  BigInt(summary.spending.amountMinor) -
                  BigInt(previousSummary.spending.amountMinor)
                ).toString(),
                currency: "GBP",
              },
            }
          : null;
      return spendingReportSchema.parse({
        month,
        startDate: bounds.start,
        endDateExclusive: bounds.endExclusive,
        permissionKey,
        scopeKey: digest([
          permissionKey,
          month,
          scope.map((a) => [a.id, a.version]),
          coverage.map((c) => [c.accountId, c.month.toISOString(), c.version]),
          budget?.id ?? null,
          budget?.version ?? 0,
        ]),
        calculatedAt: new Date().toISOString(),
        scope: scope.map((a) => {
          const c = coverage.find(
            (c) =>
              c.accountId === a.id &&
              c.month.toISOString().slice(0, 7) === month,
          );
          return {
            id: a.id,
            label: a.label,
            kind: a.kind,
            version: a.version,
            ownership: a.owned ? "OWNED" : "SHARED",
            coverage: {
              version: c?.version ?? 0,
              complete: c?.complete ?? false,
              reviewedAt: c?.updatedAt.toISOString() ?? null,
            },
          };
        }),
        coverage: {
          ...assessed,
          closedPeriod: bounds.endExclusive <= today,
          missingAccountIds: ids.filter(
            (id) =>
              !coverage.some(
                (c) =>
                  c.accountId === id &&
                  c.month.toISOString().slice(0, 7) === month &&
                  c.complete,
              ),
          ),
        },
        summary: ids.length ? summary : null,
        trend: ids.length
          ? months.map((period) => {
              const result = summaries.get(period) ?? summariseSpending([]);
              return {
                month: period,
                spending: result.spending,
                income: result.income,
                netCash: result.netCash,
                complete: assess(period).complete,
                closedPeriod: monthBounds(period).endExclusive <= today,
              };
            })
          : [],
        comparison,
        budget,
        provenance: {
          source: "CSV_MANUAL",
          latestRecordDate:
            provenance.latestRecordDate?.toISOString().slice(0, 10) ?? null,
          sourceRowCount: Number(provenance.sourceRowCount),
        },
      });
    });
  }
}
