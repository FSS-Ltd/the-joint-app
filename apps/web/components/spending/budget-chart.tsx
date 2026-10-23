import type { ReactNode } from "react";
import type { SpendingReport } from "@joint/contracts";
import { chartRatio, formatAggregateMoney } from "@joint/domain/cash-flow";
import { categoryActual } from "./budget-presentation";
export function BudgetChart({ report }: { report: SpendingReport }): ReactNode {
  if (!report.budget?.lines.length) return null;
  return (
    <div className="budget-charts">
      <h3>Category plans at a glance</h3>
      <p className="field-hint">
        Each category compares its limit with refund-adjusted actual spending.
        Apricot actual bars indicate net refunds; exact signed amounts appear in
        the table.
      </p>
      {report.budget.lines.map((line) => {
        const actual = categoryActual(report, line.category),
          signed = BigInt(actual.amountMinor),
          magnitude = signed < 0n ? -signed : signed,
          limit = BigInt(line.limit.amountMinor),
          maximum = limit > magnitude ? limit : magnitude;
        return (
          <div className="budget-chart" key={line.category ?? ""}>
            <h4>{line.category ?? "Uncategorized"}</h4>
            <p>
              Limit {formatAggregateMoney(line.limit)} · Actual{" "}
              {formatAggregateMoney(actual)}
            </p>
            <div className="budget-chart-row" aria-hidden="true">
              <span>Limit</span>
              <div className="report-track">
                <i
                  style={{
                    width: `${chartRatio(line.limit.amountMinor, maximum.toString(), 100)}%`,
                  }}
                />
              </div>
            </div>
            <div className="budget-chart-row" aria-hidden="true">
              <span>Actual</span>
              <div className="report-track">
                <i
                  className={signed < 0n ? "warm" : "actual"}
                  style={{
                    width: `${chartRatio(magnitude.toString(), maximum.toString(), 100)}%`,
                  }}
                />
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
