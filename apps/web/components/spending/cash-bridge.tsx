import type { ReactNode } from "react";
import type { SpendingReport } from "@joint/contracts";
import { formatAggregateMoney } from "@joint/domain/cash-flow";
export function CashBridge({ report }: { report: SpendingReport }): ReactNode {
  if (!report.summary) return null;
  const s = report.summary;
  return (
    <section className="surface form-card">
      <h2>Cash movement bridge</h2>
      <p>
        Spending is separate from movements between accounts, debt and
        investments.
      </p>
      <dl className="cash-bridge">
        {(
          [
            ["Transfer inflow", s.transferIn],
            ["Transfer outflow", s.transferOut],
            ["Debt service outflow", s.debtServiceOut],
            ["Debt settlement inflow", s.debtSettlementIn],
            ["Principal inflow", s.principalIn],
            ["Principal outflow", s.principalOut],
            ["Contribution inflow", s.contributionIn],
            ["Contribution outflow", s.contributionOut],
            ["Unclassified inflow", s.unclassifiedIn],
            ["Unclassified outflow", s.unclassifiedOut],
          ] as const
        ).map(([label, money]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{formatAggregateMoney(money)}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
