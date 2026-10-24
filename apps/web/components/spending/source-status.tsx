import type { ReactNode } from "react";
import type { SpendingReport } from "@joint/contracts";
import { displayDate } from "../accounts/presentation";

export function SourceStatus({
  report,
}: {
  report: SpendingReport;
}): ReactNode {
  return (
    <section className="report-source" aria-label="Report source">
      <p className="step-label">
        CSV and manual records · {report.scope.length} selected{" "}
        {report.scope.length === 1 ? "account" : "accounts"}
      </p>
      <p>
        {report.provenance.latestRecordDate ? (
          <>
            Latest booked record:{" "}
            <time dateTime={report.provenance.latestRecordDate}>
              {displayDate(report.provenance.latestRecordDate)}
            </time>
          </>
        ) : (
          "No latest booked date is available."
        )}
      </p>
      <p className="field-hint">
        Calculated{" "}
        <time dateTime={report.calculatedAt}>
          {new Date(report.calculatedAt).toLocaleString("en-GB", {
            timeZone: "Europe/London",
          })}
        </time>
        . This is a report calculation, not a bank sync or proof of complete
        history.
      </p>
    </section>
  );
}
