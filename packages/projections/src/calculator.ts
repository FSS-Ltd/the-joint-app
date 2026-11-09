import {
  monthEndAtOffset,
  projectionInputV1Schema,
  projectionResultV1Schema,
  type ProjectionInputV1,
  type ProjectionResultV1,
} from "@joint/contracts";
import {
  SCALE,
  inflationFactorAtMonth,
  monthlyCompoundingFactor,
  monthlyFeeRetentionFactor,
  roundHalfUp,
} from "./math.js";

export type WarningCode =
  | "PARTIAL_SOURCE"
  | "STALE_VALUATION"
  | "UNMODELLED_TAX"
  | "UNMODELLED_FEES"
  | "UNFUNDED_CONTRIBUTION"
  | "ILLUSTRATIVE_RATE";

export interface ProjectionOptions {
  readonly engineVersion?: string;
  readonly externalWarnings?: readonly WarningCode[];
}

/**
 * Calculates a deterministic month-by-month financial projection.
 *
 * Implements the canonical recurrence:
 * B[m] = round_HALF_UP(B[m-1] * g + C[m] - W[m] - fixedFees[m] - tax[m])
 * where g = ((1 + grossAnnual) * (1 - feeAnnual))^(1/12).
 */
export function calculateProjection(
  rawInput: ProjectionInputV1,
  options?: ProjectionOptions,
): ProjectionResultV1 {
  const input = projectionInputV1Schema.parse(rawInput);
  const openingMinor = BigInt(input.opening.amountMinor);
  const initialTargetMinor = BigInt(input.target.amountMinor);

  const horizon = input.horizonMonths;
  const isBasic = input.mode === "BASIC";

  // Pre-calculate rate factors for ADVANCED mode
  const grossFactor = isBasic
    ? SCALE
    : monthlyCompoundingFactor(input.grossAnnualRate);
  const feeRetentionFactor = isBasic
    ? SCALE
    : monthlyFeeRetentionFactor(input.proportionalFeeAnnualRate);

  // Index scheduled flows by month
  const withdrawalsByMonth = new Map<number, bigint>();
  const fixedFeesByMonth = new Map<number, bigint>();
  const taxByMonth = new Map<number, bigint>();

  if (!isBasic) {
    for (const w of input.withdrawals) {
      withdrawalsByMonth.set(w.month, BigInt(w.amount.amountMinor));
    }
    for (const f of input.fixedFees) {
      fixedFeesByMonth.set(f.month, BigInt(f.amount.amountMinor));
    }
    for (const t of input.tax) {
      taxByMonth.set(t.month, BigInt(t.amount.amountMinor));
    }
  }

  // Pre-sort contributions
  const contributionsSchedule = [...input.monthlyContributions].sort(
    (a, b) => a.fromMonth - b.fromMonth,
  );

  function getContributionForMonth(m: number): bigint {
    let activeAmount = 0n;
    for (const step of contributionsSchedule) {
      if (step.fromMonth <= m) {
        activeAmount = BigInt(step.amount.amountMinor);
      } else {
        break;
      }
    }
    return activeAmount;
  }

  // Track state across months
  let currentBalance = openingMinor;
  let totalContributions = 0n;
  let totalWithdrawals = 0n;
  let totalGrowth = 0n;
  let totalProportionalFees = 0n;
  let totalFixedFees = 0n;
  let totalTax = 0n;

  let firstQualifyingDate: string | null = null;
  let hasDeficit = false;
  let wasDepleted = false;

  const series: Array<{
    month: number;
    date: string;
    closing: { amountMinor: string; currency: "GBP" };
    target: { amountMinor: string; currency: "GBP" };
  }> = [];

  const alreadyAchieved = openingMinor >= initialTargetMinor;

  for (let m = 1; m <= horizon; m++) {
    const monthDate = monthEndAtOffset(input.firstContributionDate, m - 1);

    // 1. Target for month m
    let targetMinorForMonth: bigint;
    if (isBasic || input.targetBasis === "FIXED_NOMINAL") {
      targetMinorForMonth = initialTargetMinor;
    } else {
      const infFactor = inflationFactorAtMonth(input.inflationAnnualRate, m);
      targetMinorForMonth = roundHalfUp(initialTargetMinor * infFactor, SCALE);
    }

    // 2. Investment returns on previous closing balance
    let monthGrowth = 0n;
    let monthProportionalFee = 0n;
    let balanceInvested = currentBalance;

    if (!isBasic && currentBalance > 0n) {
      // Gross growth
      if (grossFactor !== SCALE) {
        const growthNum = currentBalance * (grossFactor - SCALE);
        monthGrowth = roundHalfUp(growthNum, SCALE);
      }

      const balanceAfterGross = currentBalance + monthGrowth;

      // Proportional fee drag
      if (balanceAfterGross > 0n && feeRetentionFactor < SCALE) {
        const feeNum = balanceAfterGross * (SCALE - feeRetentionFactor);
        monthProportionalFee = roundHalfUp(feeNum, SCALE);
      }

      balanceInvested = balanceAfterGross - monthProportionalFee;
    }

    // 3. Scheduled cash flows
    const contribution = getContributionForMonth(m);
    const withdrawal = withdrawalsByMonth.get(m) ?? 0n;
    const fixedFee = fixedFeesByMonth.get(m) ?? 0n;
    const tax = taxByMonth.get(m) ?? 0n;

    totalContributions += contribution;
    totalWithdrawals += withdrawal;
    totalGrowth += monthGrowth;
    totalProportionalFees += monthProportionalFee;
    totalFixedFees += fixedFee;
    totalTax += tax;

    // 4. Closing balance
    const netClosing =
      balanceInvested + contribution - withdrawal - fixedFee - tax;

    if (netClosing <= 0n) {
      if (withdrawal + fixedFee + tax > balanceInvested + contribution) {
        hasDeficit = true;
      }
      wasDepleted = true;
      currentBalance = 0n;
    } else {
      currentBalance = netClosing;
    }

    series.push({
      month: m,
      date: monthDate,
      closing: { amountMinor: currentBalance.toString(), currency: "GBP" },
      target: {
        amountMinor: targetMinorForMonth.toString(),
        currency: "GBP",
      },
    });

    // 5. Track first qualifying date
    if (
      !alreadyAchieved &&
      firstQualifyingDate === null &&
      currentBalance >= targetMinorForMonth
    ) {
      firstQualifyingDate = monthDate;
    }
  }

  // Determine status
  let status:
    | "already_achieved"
    | "reachable"
    | "insufficient_inputs"
    | "budget_deficit"
    | "depleted"
    | "unreachable_under_assumptions"
    | "beyond_horizon";

  if (alreadyAchieved) {
    status = "already_achieved";
    firstQualifyingDate = null;
  } else if (firstQualifyingDate !== null) {
    status = "reachable";
  } else if (hasDeficit) {
    status = "budget_deficit";
  } else if (wasDepleted && currentBalance === 0n) {
    status = "depleted";
  } else {
    // Check if progress is positive or declining
    const finalSeriesTarget = BigInt(
      series[series.length - 1]!.target.amountMinor,
    );
    const netGrowthPossible =
      currentBalance > openingMinor ||
      (!isBasic &&
        Number(input.grossAnnualRate) >
          Number(input.proportionalFeeAnnualRate));

    if (
      !netGrowthPossible &&
      currentBalance <= openingMinor &&
      currentBalance < finalSeriesTarget
    ) {
      status = "unreachable_under_assumptions";
    } else {
      status = "beyond_horizon";
    }
  }

  // Compile warnings
  const warningsSet = new Set<WarningCode>(options?.externalWarnings ?? []);

  if (isBasic) {
    warningsSet.add("UNMODELLED_FEES");
    warningsSet.add("UNMODELLED_TAX");
  } else {
    if (
      input.proportionalFeeAnnualRate === "0" &&
      input.fixedFees.length === 0
    ) {
      warningsSet.add("UNMODELLED_FEES");
    }
    if (input.tax.length === 0) {
      warningsSet.add("UNMODELLED_TAX");
    }
    if (
      input.rateProvenance.growth.sourceKind === "ILLUSTRATION" ||
      input.rateProvenance.fee.sourceKind === "ILLUSTRATION" ||
      input.rateProvenance.inflation.sourceKind === "ILLUSTRATION"
    ) {
      warningsSet.add("ILLUSTRATIVE_RATE");
    }
  }

  const result: ProjectionResultV1 = {
    schema: "projection-result",
    schemaVersion: 1,
    status,
    firstQualifyingDate,
    series,
    breakdown: {
      opening: { amountMinor: input.opening.amountMinor, currency: "GBP" },
      contributions: {
        amountMinor: totalContributions.toString(),
        currency: "GBP",
      },
      withdrawals: {
        amountMinor: totalWithdrawals.toString(),
        currency: "GBP",
      },
      growth: {
        amountMinor: totalGrowth.toString(),
        currency: "GBP",
      },
      proportionalFees: {
        amountMinor: totalProportionalFees.toString(),
        currency: "GBP",
      },
      fixedFees: {
        amountMinor: totalFixedFees.toString(),
        currency: "GBP",
      },
      tax: {
        amountMinor: totalTax.toString(),
        currency: "GBP",
      },
      closing: {
        amountMinor: currentBalance.toString(),
        currency: "GBP",
      },
    },
    warnings: Array.from(warningsSet),
  };

  return projectionResultV1Schema.parse(result);
}
