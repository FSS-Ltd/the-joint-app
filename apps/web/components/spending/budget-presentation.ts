import type { AggregateMoney, SpendingReport } from "@joint/contracts";
import { chartRatio } from "@joint/domain/cash-flow";
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

interface CapPosition {
  remainingMinor: string;
  status: "remaining" | "reached" | "over";
  usedPercent: number;
  withinPercent: number;
  overPercent: number;
}

export function capPosition(
  limitMinor: string,
  actualMinor: string,
): CapPosition {
  const limit = BigInt(limitMinor);
  const actual = BigInt(actualMinor);
  const remaining = limit - actual;
  const positive = actual > 0n ? actual : 0n;
  const maximum = limit > positive ? limit : positive;
  const within = positive > limit ? limit : positive;
  const withinPercent =
    chartRatio(within.toString(), maximum.toString(), 10000) / 100;
  return {
    remainingMinor: remaining.toString(),
    status:
      remaining < 0n ? "over" : remaining === 0n ? "reached" : "remaining",
    usedPercent:
      limit === 0n && positive > 0n
        ? 100
        : chartRatio(positive.toString(), limit.toString(), 100),
    withinPercent,
    overPercent: actual > limit ? 100 - withinPercent : 0,
  };
}
