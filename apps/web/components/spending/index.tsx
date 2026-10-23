"use client";
import type { ReactNode } from "react";
import { AccountsFrame } from "../accounts/frame";
import { Feedback } from "../identity/frame";
import { useSpendingReport } from "./use-report";
import { ReportScope } from "./scope-controls";
import { Summary, Trend, CategoryBreakdown } from "./summary";
import { Coverage } from "./coverage";
import { BudgetEditor } from "./budget-editor";
import { formatAggregateMoney } from "@joint/domain/cash-flow";
import "../finance/finance.css";
import "./spending.css";
export function SpendingScreen({
  mode,
}: {
  mode: "dashboard" | "budgets" | "review";
}): ReactNode {
  const state = useSpendingReport(),
    r = state.report;
  return (
    <AccountsFrame
      active={mode}
      reportQuery={new URLSearchParams({
        month: state.month,
        ...(state.selected ? { accountIds: state.selected.join(",") } : {}),
      }).toString()}
      title={
        mode === "dashboard"
          ? "A clearer everyday picture"
          : mode === "budgets"
            ? "Room for what matters"
            : "Your monthly review"
      }
      description={
        mode === "dashboard"
          ? "See spending and cash flow for the accounts you choose."
          : mode === "budgets"
            ? "A shared plan, grounded in the same visible accounts."
            : "Check the history, understand the changes, then plan together."
      }
      household={state.identity?.membership?.household.name}
    >
      <div className="finance-stack">
        <ReportScope state={state} />
        <Feedback error={state.error} />
        {state.pending && <p role="status">Refreshing your selected month…</p>}
        {r && state.householdId && (
          <>
            {!r.scope.length ? (
              <section className="surface finance-empty">
                <h2>Your picture starts with an account</h2>
                <p>No accounts with Values and details access are available.</p>
                <a className="button primary" href="/accounts">
                  Go to accounts
                </a>
              </section>
            ) : (
              <>
                <p className="report-freshness">
                  CSV and manual records · Calculated{" "}
                  <time dateTime={r.calculatedAt}>
                    {new Date(r.calculatedAt).toLocaleString("en-GB")}
                  </time>{" "}
                  · {r.scope.length} selected accounts
                </p>
                {mode !== "budgets" && <Summary report={r} />}
                {mode === "budgets" && (
                  <BudgetEditor
                    key={`${r.scopeKey}:${r.budget?.version ?? 0}`}
                    report={r}
                    householdId={state.householdId}
                    refresh={state.refresh}
                  />
                )}
                <Coverage
                  report={r}
                  householdId={state.householdId}
                  refresh={state.refresh}
                />
                {mode !== "budgets" && (
                  <div className="report-grid">
                    <CategoryBreakdown report={r} />
                    <Trend report={r} />
                  </div>
                )}
                <div className="finance-stack">
                  <section className="surface form-card">
                    <h2>
                      {mode === "review"
                        ? "Review the details"
                        : "Keep your picture current"}
                    </h2>
                    <p>
                      {r.summary?.unreviewedCount ?? 0} unreviewed components ·{" "}
                      {r.summary?.unclassifiedCount ?? 0} unclassified
                      components
                    </p>
                    <ul className="review-actions">
                      {r.scope.map((a) => (
                        <li key={a.id}>
                          <a
                            href={`/activity?account=${a.id}&month=${r.month}`}
                          >
                            Review {a.label} activity
                          </a>
                        </li>
                      ))}
                    </ul>
                    <a className="form-link" href="/imports">
                      Import a CSV
                    </a>
                  </section>
                </div>
                {mode === "review" && (
                  <BudgetEditor
                    key={`${r.scopeKey}:${r.budget?.version ?? 0}`}
                    report={r}
                    householdId={state.householdId}
                    refresh={state.refresh}
                  />
                )}
                {mode === "review" && r.summary && (
                  <section className="surface form-card">
                    <h2>Cash movement bridge</h2>
                    <p>
                      Spending is separate from movements between accounts, debt
                      and investments.
                    </p>
                    <dl className="cash-bridge">
                      {(
                        [
                          ["Transfer inflow", r.summary.transferIn],
                          ["Transfer outflow", r.summary.transferOut],
                          ["Debt service outflow", r.summary.debtServiceOut],
                          [
                            "Debt settlement inflow",
                            r.summary.debtSettlementIn,
                          ],
                          ["Principal inflow", r.summary.principalIn],
                          ["Principal outflow", r.summary.principalOut],
                          ["Contribution inflow", r.summary.contributionIn],
                          ["Contribution outflow", r.summary.contributionOut],
                          ["Unclassified inflow", r.summary.unclassifiedIn],
                          ["Unclassified outflow", r.summary.unclassifiedOut],
                        ] as const
                      ).map(([label, money]) => (
                        <div key={label}>
                          <dt>{label}</dt>
                          <dd>{formatAggregateMoney(money)}</dd>
                        </div>
                      ))}
                    </dl>
                  </section>
                )}
              </>
            )}
          </>
        )}
      </div>
    </AccountsFrame>
  );
}
