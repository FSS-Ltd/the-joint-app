import type { ReactNode } from "react";
import type { Money } from "@joint/contracts";
import { formatMoney } from "@joint/domain";

/** Wrap between thousands groups, keeping the sign and decimal fraction intact. */
export function ArchiveAmount({ money }: { money: Money }): ReactNode {
  const groups = formatMoney(money).split(",");
  return groups.map((group, index) => (
    <span className="archive-amount-group" key={index}>
      {group}
      {index < groups.length - 1 ? "," : ""}
    </span>
  ));
}
