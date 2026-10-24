import type { ReactNode } from "react";
import type { AggregateMoney, BudgetResponse } from "@joint/contracts";
import { formatAggregateMoney, formatGbpMinor } from "@joint/domain/cash-flow";
import { capPosition } from "./budget-presentation";

export function CapCard({
  line,
  actual,
}: {
  line: BudgetResponse["lines"][number];
  actual: AggregateMoney;
}): ReactNode {
  const position = capPosition(line.limit.amountMinor, actual.amountMinor);
  const category = line.category ?? "Uncategorized";
  const remaining = BigInt(position.remainingMinor);
  const amount = formatGbpMinor(remaining < 0n ? -remaining : remaining);
  const status =
    position.status === "over"
      ? "Over limit"
      : position.status === "reached"
        ? "Limit reached"
        : "Within cap";
  const balance = `${amount} ${position.status === "over" ? "over limit" : "left"}`;
  return (
    <article className={`surface cap-card cap-${position.status}`}>
      <header>
        <h3>{category}</h3>
        <span className="cap-status">{status}</span>
      </header>
      <p className="cap-balance">{balance}</p>
      <p className="cap-actual">
        {formatAggregateMoney(actual)} spent ·{" "}
        {formatAggregateMoney(line.limit)} cap
      </p>
      <div
        className="cap-ruler"
        role="meter"
        aria-label={`${category} cap used`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={position.usedPercent}
        aria-valuetext={`${formatAggregateMoney(actual)} spent of ${formatAggregateMoney(line.limit)} cap; ${balance}`}
      >
        <span
          className="cap-within"
          style={{ width: `${position.withinPercent}%` }}
        />
        <span
          className="cap-excess"
          style={{ width: `${position.overPercent}%` }}
        />
      </div>
      {position.status === "over" ? (
        <p className="cap-saving-impact">
          {amount} less to put toward saving if other spending stays as planned.
          This comparison does not move money.
        </p>
      ) : BigInt(actual.amountMinor) < 0n ? (
        <p className="field-hint">
          Net refunds increase the remaining allowance. This is a cap
          comparison, not an account balance.
        </p>
      ) : null}
    </article>
  );
}
