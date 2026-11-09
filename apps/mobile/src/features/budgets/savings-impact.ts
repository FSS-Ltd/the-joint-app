import { formatGbpMinor } from "@joint/domain/cash-flow";

export interface CategoryVariance {
  limitMinor: string;
  actualMinor: string;
  varianceMinor: string; // limit - actual (positive = underspend, negative = overspend)
  status: "underspend" | "reached" | "overspend";
}

export function calculateCategoryVariance(
  limitMinor: string,
  actualMinor: string,
): CategoryVariance {
  const limit = BigInt(limitMinor);
  const actual = BigInt(actualMinor);
  const variance = limit - actual;

  return {
    limitMinor,
    actualMinor,
    varianceMinor: variance.toString(),
    status:
      variance > 0n ? "underspend" : variance === 0n ? "reached" : "overspend",
  };
}

export interface HouseholdSavingsImpact {
  scheduledSavingsMinor: string;
  totalCappedLimitMinor: string;
  totalCappedActualMinor: string;
  netCapVarianceMinor: string;
  netOverspendMinor: string;
  netUnderspendMinor: string;
  qualifiedSavingsMinor: string;
  impactExplanation: string;
}

export function calculateHouseholdSavingsImpact(
  scheduledSavingsMinor: string,
  capLines: readonly { limitMinor: string; actualMinor: string }[],
): HouseholdSavingsImpact {
  const scheduled = BigInt(scheduledSavingsMinor);
  let totalLimit = 0n;
  let totalActual = 0n;

  for (const line of capLines) {
    totalLimit += BigInt(line.limitMinor);
    totalActual += BigInt(line.actualMinor);
  }

  const netVariance = totalLimit - totalActual;
  const netOverspend = netVariance < 0n ? -netVariance : 0n;
  const netUnderspend = netVariance > 0n ? netVariance : 0n;

  // Overspend reduces qualified savings; underspend does not create fictitious cash
  const qualifiedSavings =
    netOverspend > 0n
      ? scheduled > netOverspend
        ? scheduled - netOverspend
        : 0n
      : scheduled;

  let explanation: string;
  if (capLines.length === 0) {
    explanation = "No category caps active this month.";
  } else if (netOverspend > 0n) {
    const overFormatted = formatGbpMinor(netOverspend);
    if (qualifiedSavings === 0n) {
      explanation = `Planned savings fully absorbed by ${overFormatted} net overspending across budget caps.`;
    } else {
      explanation = `${overFormatted} less put toward savings due to net cap overspending. Qualified savings: ${formatGbpMinor(qualifiedSavings)}.`;
    }
  } else if (netUnderspend > 0n) {
    const underFormatted = formatGbpMinor(netUnderspend);
    explanation = `Full planned savings qualified. ${underFormatted} unspent across budget caps available for additional allocation.`;
  } else {
    explanation =
      "Full planned savings qualified. Spending exactly matched active budget caps.";
  }

  return {
    scheduledSavingsMinor,
    totalCappedLimitMinor: totalLimit.toString(),
    totalCappedActualMinor: totalActual.toString(),
    netCapVarianceMinor: netVariance.toString(),
    netOverspendMinor: netOverspend.toString(),
    netUnderspendMinor: netUnderspend.toString(),
    qualifiedSavingsMinor: qualifiedSavings.toString(),
    impactExplanation: explanation,
  };
}
