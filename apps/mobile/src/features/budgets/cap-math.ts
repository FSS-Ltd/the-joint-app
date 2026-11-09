import type { AggregateMoney, SpendingReport } from "@joint/contracts";
import { chartRatio, formatGbpMinor } from "@joint/domain/cash-flow";

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

export interface CapPosition {
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

/** Human-readable balance label: "£18.00 left", "£0.00 left · Limit reached", "£8.00 over limit". */
export function formatCapBalance(position: CapPosition): string {
  const abs = BigInt(position.remainingMinor);
  const amount = formatGbpMinor(abs < 0n ? -abs : abs);
  if (position.status === "over") return `${amount} over limit`;
  if (position.status === "reached") return `${amount} left · Limit reached`;
  return `${amount} left`;
}

/** Short status label for the cap card header badge. */
export function formatCapStatus(position: CapPosition): string {
  if (position.status === "over") return "Over limit";
  if (position.status === "reached") return "Limit reached";
  return "Within cap";
}

/**
 * Saving-plan impact copy when over limit — mirrors web CapCard.
 * Returns null when within cap or at limit.
 */
export function formatSavingImpact(
  _category: string,
  position: CapPosition,
): string | null {
  if (position.status !== "over") return null;
  const abs = BigInt(position.remainingMinor);
  const amount = formatGbpMinor(abs < 0n ? -abs : abs);
  return `${amount} less to put toward saving if other spending stays as planned. This comparison does not move money.`;
}

/** True when the actual spend is negative (net refunds received). */
export function hasNetRefund(actualMinor: string): boolean {
  return BigInt(actualMinor) < 0n;
}
