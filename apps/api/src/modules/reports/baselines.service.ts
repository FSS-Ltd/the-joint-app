import {
  baselinesReportSchema,
  type AuthContext,
  type BaselinesReport,
} from "@joint/contracts";
import type { ScopedDatabase } from "@joint/database/scoped";
import {
  calculateBaselines,
  type MonthBaselineInput,
} from "@joint/domain/spending";
import {
  monthBounds,
  previousMonths,
  summariseSpending,
} from "@joint/domain/cash-flow";
import { londonToday } from "@joint/domain/transactions";
import { resolveReportScope } from "./report-scope.js";
import { reportComponents } from "./report-components.js";

export class BaselinesService {
  constructor(private readonly database: ScopedDatabase) {}

  async read(
    context: AuthContext,
    accountIds?: readonly string[],
  ): Promise<BaselinesReport> {
    return this.database.withScope(context, async (tx) => {
      const scope = await resolveReportScope(tx, context, accountIds);
      const ids = scope.map((a) => a.id);
      const today = londonToday();
      const currentMonth = today.slice(0, 7);

      if (ids.length === 0) {
        const emptyResult = calculateBaselines({
          months: [],
          currentMonth,
          scopeAccountIds: [],
        });
        return baselinesReportSchema.parse(emptyResult);
      }

      // Generate up to 12 preceding completed months (strictly before currentMonth)
      const allMonths = previousMonths(currentMonth, 13);
      const precedingMonths = allMonths.slice(0, 12);
      const firstMonth = precedingMonths[0] ?? currentMonth;
      const firstBounds = monthBounds(firstMonth);
      const lastCompletedMonth =
        precedingMonths[precedingMonths.length - 1] ?? currentMonth;
      const lastBounds = monthBounds(lastCompletedMonth);

      // Fetch coverage for scoped accounts across all 12 preceding months
      const coverageRows = await tx.accountMonthCoverage.findMany({
        where: {
          householdId: context.householdId,
          accountId: { in: ids },
          month: {
            gte: new Date(firstBounds.start),
            lte: new Date(lastBounds.start),
          },
        },
        select: {
          accountId: true,
          month: true,
          complete: true,
        },
      });

      // Fetch components for all preceding months in one batch query
      const components = await reportComponents(
        tx,
        context,
        scope,
        firstBounds.start,
        lastBounds.endExclusive,
        [],
      );

      // Build MonthBaselineInput for each preceding month
      const monthInputs: MonthBaselineInput[] = precedingMonths.map((month) => {
        const monthCoverage = coverageRows.filter(
          (c) =>
            c.month.toISOString().slice(0, 7) === month &&
            ids.includes(c.accountId),
        );
        const complete =
          monthCoverage.length === ids.length &&
          monthCoverage.every((c) => c.complete);

        const monthComponents = components.filter((c) => c.month === month);
        const summary = summariseSpending(monthComponents);

        return {
          month,
          spendingMinor: summary.spending.amountMinor,
          incomeMinor: summary.income.amountMinor,
          complete,
        };
      });

      const result = calculateBaselines({
        months: monthInputs,
        currentMonth,
        scopeAccountIds: ids,
      });

      return baselinesReportSchema.parse(result);
    });
  }
}
