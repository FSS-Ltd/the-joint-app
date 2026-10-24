import type { ReactNode } from "react";
import type { NormalizedCsvRow } from "@joint/contracts";
import { formatMoney } from "@joint/domain";
import { displayDate } from "../accounts/presentation";
import { rejectLabels } from "./presentation";
export function ReviewRow({
  row,
  editable,
  pending,
  choice,
  onChoose,
}: {
  row: NormalizedCsvRow;
  editable: boolean;
  pending: boolean;
  choice: "KEEP" | "SKIP" | undefined;
  onChoose: (decision: "KEEP" | "SKIP") => void;
}): ReactNode {
  return (
    <li
      className={`surface import-review-row${row.status === "REJECTED" ? " import-row-rejected" : ""}`}
    >
      <div className="import-row-layout">
        <div>
          <span className="step-label">Row {row.rowNumber}</span>
          {row.status === "REJECTED" ? (
            <>
              <h3>Rejected row</h3>
              <p>{rejectLabels[row.reason]}</p>
            </>
          ) : (
            <>
              <h3>{row.description}</h3>
              <p>
                {displayDate(row.bookedDate)} · CSV
                {row.sourceId ? ` · Source ID: ${row.sourceId}` : ""}
              </p>
              {row.duplicate ? (
                <p className="finance-warning">
                  Same stable source ID and content already recorded. This row
                  is skipped.
                </p>
              ) : (
                <>
                  <p className="field-hint">
                    {row.decision === "REVIEW"
                      ? "Decision needed"
                      : row.decision === "KEEP"
                        ? "Keep"
                        : "Skip"}
                    {row.overlaps.length ? " · Possible overlap" : ""}
                  </p>
                  {row.overlaps.map((overlap) => (
                    <p className="finance-warning" key={overlap.transactionId}>
                      Existing: {displayDate(overlap.bookedDate)} ·{" "}
                      {overlap.description} · {formatMoney(overlap.money)}
                    </p>
                  ))}
                  {editable && (
                    <fieldset className="row-decision" disabled={pending}>
                      <legend>Decision for row {row.rowNumber}</legend>
                      {(["KEEP", "SKIP"] as const).map((decision) => (
                        <label key={decision}>
                          <input
                            type="radio"
                            name={`row-${row.rowNumber}`}
                            checked={(choice ?? row.decision) === decision}
                            onChange={() => onChoose(decision)}
                          />
                          {decision === "KEEP" ? "Keep" : "Skip"}
                        </label>
                      ))}
                    </fieldset>
                  )}
                </>
              )}
            </>
          )}
        </div>
        {row.status === "VALID" && (
          <strong className="import-row-amount">
            {BigInt(row.money.amountMinor) > 0n ? "+" : ""}
            {formatMoney(row.money)}
          </strong>
        )}
      </div>
    </li>
  );
}
