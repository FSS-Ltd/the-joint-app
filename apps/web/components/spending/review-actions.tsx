import type { ReactNode } from "react";
import type { SpendingReport } from "@joint/contracts";
export function ReviewActions({
  report,
  mode,
}: {
  report: SpendingReport;
  mode: "dashboard" | "budgets" | "review";
}): ReactNode {
  return (
    <section className="surface form-card report-review-actions">
      <h2>
        {mode === "review" ? "Review the details" : "Keep your picture current"}
      </h2>
      {report.summary ? (
        <p>
          {report.summary.unreviewedCount} unreviewed components ·{" "}
          {report.summary.unclassifiedCount} unclassified components
        </p>
      ) : (
        <p>Review counts are unavailable. Refresh the report to try again.</p>
      )}
      <ul className="review-actions">
        {report.scope.map((account) => (
          <li key={account.id}>
            <a href={`/activity?account=${account.id}&month=${report.month}`}>
              Review {account.label} activity
            </a>
          </li>
        ))}
      </ul>
      <a className="form-link" href="/imports">
        Import a CSV
      </a>
    </section>
  );
}
