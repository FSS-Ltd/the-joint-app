"use client";
import type { ReactNode } from "react";
import { AccountsFrame } from "../accounts/frame";
import { Feedback } from "../identity/frame";
import { useSpendingReport } from "./use-report";
import { ReportScope } from "./scope-controls";
import { Summary, Trend, CategoryBreakdown } from "./summary";
import { Coverage } from "./coverage";
import { BudgetEditor } from "./budget-editor";
import { CashBridge } from "./cash-bridge";
import { ReviewActions } from "./review-actions";
import { SourceStatus } from "./source-status";
import { BudgetChart } from "./budget-chart";
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
      <div className="finance-stack spending-workspace">
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
                <SourceStatus report={r} />
                {mode !== "budgets" && <Summary report={r} />}
                <BudgetChart report={r} compact={mode === "dashboard"} />
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
                <ReviewActions report={r} mode={mode} />
                {mode === "review" && (
                  <BudgetEditor
                    key={`${r.scopeKey}:${r.budget?.version ?? 0}`}
                    report={r}
                    householdId={state.householdId}
                    refresh={state.refresh}
                  />
                )}
                {mode === "review" && <CashBridge report={r} />}
              </>
            )}
          </>
        )}
      </div>
    </AccountsFrame>
  );
}
