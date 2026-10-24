import type { ReactNode } from "react";
import type { TransactionResponse } from "@joint/contracts";
import { formatMoney } from "@joint/domain";
import { displayDate } from "../accounts/presentation";
import { kindLabels } from "./kinds";

export function TransactionSourceSummary({
  transaction,
  reload,
}: {
  transaction: TransactionResponse;
  reload: () => void;
}): ReactNode {
  return (
    <section className="activity-source-frame" aria-label="Transaction source">
      <div className="surface activity-source-summary">
        <div className="activity-source-heading">
          <div>
            <p className="step-label">
              {transaction.source === "CSV" ? "CSV import" : "Manual entry"} ·
              Booked{" "}
              <time dateTime={transaction.bookedDate}>
                {displayDate(transaction.bookedDate)}
              </time>
            </p>
            <h2>{transaction.description}</h2>
          </div>
          <button className="text-button" type="button" onClick={reload}>
            Reload transaction
          </button>
        </div>
        <p className="activity-source-amount">
          {BigInt(transaction.money.amountMinor) > 0n ? "+" : ""}
          {formatMoney(transaction.money)}
        </p>
        <p>
          {transaction.splits.length
            ? `Split transaction · ${transaction.splits.length} components`
            : `${kindLabels[transaction.effectiveKind ?? "UNCLASSIFIED"]} · ${transaction.classificationConfirmed ? "Reviewed" : "Unreviewed default"}`}
          {transaction.transfer?.confirmed ? " · Confirmed transfer" : ""}
        </p>
        <p>
          {[
            transaction.splits.length ? null : transaction.category,
            transaction.merchant,
          ]
            .filter(Boolean)
            .join(" · ") ||
            (transaction.splits.length
              ? "Categorized through split components."
              : "No classification yet.")}
        </p>
        <div className="activity-source-notes">
          {transaction.source === "CSV" && (
            <p>
              Imported date, amount and description preserve the source record
              and cannot be edited.
            </p>
          )}
          {!transaction.permissions.canClassify && (
            <p>
              The owner controls corrections and shared classification. Your own
              note remains private.
            </p>
          )}
          <p>Booked activity is separate from your dated account value.</p>
        </div>
      </div>
    </section>
  );
}
