import type { ReactNode } from "react";
import type { ImportBatchResponse } from "@joint/contracts";
import { importStateLabel } from "./presentation";
import { ImportSteps } from "./steps";

export function ImportBatchSummary({
  batch,
  dirty,
  refresh,
}: {
  batch: ImportBatchResponse;
  dirty: boolean;
  refresh: () => void;
}): ReactNode {
  const working = ["QUEUED", "PREVIEWING", "COMMITTING"].includes(batch.state);
  const counts = [
    { label: "Source rows", count: batch.totalRows },
    { label: "Valid rows", count: batch.validRows },
    { label: "Rejected rows", count: batch.rejectedRows },
    { label: "Possible overlaps", count: batch.overlapRows },
    { label: "Duplicate rows", count: batch.duplicateRows },
    { label: "Committed transactions", count: batch.committedRows },
  ];
  return (
    <section className="import-batch-frame" aria-label="Import overview">
      <div className="surface import-batch-summary">
        <ImportSteps stage="review" />
        <div className="import-summary-heading">
          <div>
            <p className="step-label">CSV · Local import</p>
            <h2>{importStateLabel(batch.state)}</h2>
            <p className="field-hint">
              Created{" "}
              <time dateTime={batch.createdAt}>
                {new Date(batch.createdAt).toLocaleDateString("en-GB", {
                  timeZone: "Europe/London",
                })}
              </time>
            </p>
          </div>
          <button
            className="text-button"
            type="button"
            disabled={dirty}
            onClick={refresh}
          >
            Refresh import status
          </button>
        </div>
        <dl className="import-counts">
          {counts.map(({ label, count }) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{count.toLocaleString("en-GB")}</dd>
            </div>
          ))}
        </dl>
        <p className="import-count-note">
          Valid rows may still need a Keep or Skip choice, or be duplicates.
          Review the state above to see whether activity was published or rolled
          back.
        </p>
        {working && (
          <div role="status">
            <progress
              className="finance-progress"
              max={batch.totalRows || 1}
              {...(batch.totalRows ? { value: batch.processedRows } : {})}
            />
            <p>
              {batch.processedRows} of {batch.totalRows} rows processed.
              Transactions appear only after the whole commit succeeds.
            </p>
          </div>
        )}
        {batch.state === "COMMITTED" && (
          <p role="status">
            {batch.committedRows} transactions imported. {batch.skippedRows}{" "}
            rows skipped.
          </p>
        )}
        {batch.state === "FAILED" && (
          <p role="alert">
            This import could not complete. No partial commit is shown in
            activity. Return to imports to inspect a new file.
          </p>
        )}
        {batch.state === "EXPIRED" && (
          <p>This preview has expired. Inspect and upload the file again.</p>
        )}
        <a className="form-link" href={`/activity?account=${batch.accountId}`}>
          View account activity
        </a>
      </div>
    </section>
  );
}
