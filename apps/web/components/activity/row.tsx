import type { ReactNode } from "react";
import type { TransactionResponse } from "@joint/contracts";
import { formatMoney } from "@joint/domain";
import { displayDate } from "../accounts/presentation";
import { kindLabels } from "./kinds";

export function ActivityRow({
  transaction,
}: {
  transaction: TransactionResponse;
}): ReactNode {
  const incoming = BigInt(transaction.money.amountMinor) > 0n;
  return (
    <li>
      <a className="surface activity-row" href={`/activity/${transaction.id}`}>
        <div className="activity-row-description">
          <h3>{transaction.description}</h3>
          <p>
            <time dateTime={transaction.bookedDate}>
              {displayDate(transaction.bookedDate)}
            </time>
            {" · "}
            {transaction.source === "MANUAL" ? "Manual entry" : "CSV import"}
          </p>
          {((!transaction.splits.length && transaction.category) ||
            transaction.merchant) && (
            <p>
              {[
                transaction.splits.length ? null : transaction.category,
                transaction.merchant,
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
          )}
        </div>
        <div className="activity-row-amount">
          <strong>
            {incoming ? "+" : ""}
            {formatMoney(transaction.money)}
          </strong>
          <p>
            {incoming
              ? "Money in"
              : BigInt(transaction.money.amountMinor) < 0n
                ? "Money out"
                : "Zero amount"}
          </p>
        </div>
        <p className="activity-row-review">
          {transaction.splits.length
            ? `Split transaction · ${transaction.splits.length} components`
            : `${kindLabels[transaction.effectiveKind ?? "UNCLASSIFIED"]} · ${transaction.classificationConfirmed ? "Reviewed" : "Unreviewed"}`}
        </p>
      </a>
    </li>
  );
}
