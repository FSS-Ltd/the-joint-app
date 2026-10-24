import type { ReactNode } from "react";
import type { SpendingReport } from "@joint/contracts";
import { categoryActual } from "./budget-presentation";
import { CapCard } from "./cap-card";
import "./caps.css";

export function BudgetChart({
  report,
  compact = false,
}: {
  report: SpendingReport;
  compact?: boolean;
}): ReactNode {
  if (!report.summary || !report.budget?.lines.length) return null;
  const lines = compact ? report.budget.lines.slice(0, 3) : report.budget.lines;
  const query = new URLSearchParams({
    month: report.month,
    accountIds: report.scope.map((account) => account.id).join(","),
  }).toString();
  return (
    <section className="budget-charts" aria-label="Category caps">
      <div className="finance-section-title">
        <h2>Category plans at a glance</h2>
        {compact && (
          <a className="form-link" href={`/budgets?${query}`}>
            View all category caps
          </a>
        )}
      </div>
      <p className="field-hint">
        Refund-adjusted spending for these selected accounts and this month.
        {!report.coverage.complete &&
          " This picture is incomplete until history and classifications are reviewed."}
        {compact &&
          lines.length < report.budget.lines.length &&
          ` Showing ${lines.length} of ${report.budget.lines.length} saved caps.`}
      </p>
      <div className="cap-grid">
        {lines.map((line) => (
          <CapCard
            key={line.category ?? ""}
            line={line}
            actual={categoryActual(report, line.category)}
          />
        ))}
      </div>
      <aside className="cap-month-end">
        <h3>
          {report.coverage.closedPeriod
            ? "Anything left this month?"
            : "A thought for month end"}
        </h3>
        <p>
          Review any remaining allowance for a saving or investment allocation
          together. Check income, bills and complete history first. An unused
          cap is not proof of available cash.
        </p>
        <a className="form-link" href={`/review?${query}`}>
          Review this month
        </a>
      </aside>
    </section>
  );
}
