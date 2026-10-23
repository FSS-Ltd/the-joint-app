import type { ReactNode } from "react";
import type { TransactionResponse } from "@joint/contracts";
import { formatMoney } from "@joint/domain";
import { kindLabels } from "./kinds";
export function SplitSummary({
  transaction,
}: {
  transaction: TransactionResponse;
}): ReactNode {
  if (!transaction.splits.length) return null;
  return (
    <section className="surface form-card">
      <h2>Split components</h2>
      <p>
        These components replace the parent amount in spending and cash-flow
        reports. The source record is kept above.
      </p>
      <div
        className="report-table-wrap"
        role="region"
        aria-label="Split components table"
        tabIndex={0}
      >
        <table className="report-table">
          <caption>How this transaction is split</caption>
          <thead>
            <tr>
              <th scope="col">Category</th>
              <th scope="col">Financial type</th>
              <th scope="col">Amount</th>
            </tr>
          </thead>
          <tbody>
            {transaction.splits.map((line) => (
              <tr key={line.id}>
                <th scope="row">{line.category ?? "Uncategorized"}</th>
                <td>{kindLabels[line.classificationKind]}</td>
                <td>{formatMoney(line.money)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
