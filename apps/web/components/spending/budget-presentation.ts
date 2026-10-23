import type { AggregateMoney, SpendingReport } from "@joint/contracts";
export function categoryActual(
  report: SpendingReport,
  category: string | null,
): AggregateMoney {
  return (
    report.summary?.categories.find(
      (line) => !line.grouped && line.category === category,
    )?.spending ?? { amountMinor: "0", currency: "GBP" }
  );
}
