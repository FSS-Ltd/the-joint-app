"use client";
import { useState, type ReactNode } from "react";
import type { CoverageReason, SpendingReport } from "@joint/contracts";
import { request, errorMessage } from "../identity/client";
import { isAccessError } from "../finance/access-error";
import { Feedback } from "../identity/frame";
const reasons: Record<CoverageReason, string> = {
  MISSING_HISTORY: "History has not been confirmed for every selected account.",
  OPEN_PERIOD: "This month is still open. Its figures will change.",
  UNREVIEWED: "Some financial classifications need an owner’s review.",
  UNCLASSIFIED: "Some cash movements have no financial classification.",
  UNKNOWN_DEBT_SERVICE:
    "Debt payments need a principal and interest breakdown.",
  NO_ACCOUNTS: "No accounts with Values and details access are available.",
};
export function Coverage({
  report,
  householdId,
  refresh,
}: {
  report: SpendingReport;
  householdId: string;
  refresh: () => void;
}): ReactNode {
  const [pending, setPending] = useState(""),
    [error, setError] = useState("");
  async function attest(id: string, version: number, complete: boolean) {
    setPending(id);
    setError("");
    try {
      await request(
        `/api/households/${householdId}/accounts/${id}/coverage/${report.month}`,
        { complete },
        undefined,
        { method: "PUT", ifMatch: version },
      );
      refresh();
    } catch (cause) {
      if (isAccessError(cause)) refresh();
      setError(errorMessage(cause));
    } finally {
      setPending("");
    }
  }
  return (
    <section
      className="surface form-card coverage-card"
      aria-label="History coverage"
    >
      <p className="step-label">How complete is this picture?</p>
      <h2>
        {report.coverage.complete
          ? "Ready to review together"
          : "A little context first"}
      </h2>
      {report.coverage.reasons.length > 0 && (
        <ul>
          {report.coverage.reasons.map((r) => (
            <li key={r}>{reasons[r]}</li>
          ))}
        </ul>
      )}
      <p>
        Confirm history only when all booked records for the whole month are
        included. An import alone cannot prove this.
      </p>
      <ul className="coverage-list">
        {report.scope.map((a) => (
          <li key={a.id}>
            <div>
              <strong>{a.label}</strong>
              <span>
                {a.ownership === "OWNED" ? "Yours" : "Shared with you"} ·{" "}
                {a.coverage.complete
                  ? "History confirmed"
                  : "History unconfirmed"}
              </span>
            </div>
            {a.ownership === "OWNED" && (
              <button
                className="button secondary"
                type="button"
                disabled={
                  Boolean(pending) ||
                  (!a.coverage.complete && !report.coverage.closedPeriod)
                }
                onClick={() =>
                  void attest(a.id, a.coverage.version, !a.coverage.complete)
                }
              >
                {pending === a.id
                  ? "Saving…"
                  : a.coverage.complete
                    ? "Mark history incomplete"
                    : "Confirm whole-month history"}
              </button>
            )}
          </li>
        ))}
      </ul>
      <Feedback error={error} />
    </section>
  );
}
