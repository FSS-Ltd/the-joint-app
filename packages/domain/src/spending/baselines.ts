import { previousMonths } from "../cash-flow-periods.js";

export interface MonthBaselineInput {
  month: string; // YYYY-MM
  spendingMinor: bigint | string;
  incomeMinor: bigint | string;
  complete: boolean;
}

export interface MonthBaselineWindow {
  windowMonths: 3 | 6 | 12;
  complete: boolean;
  months: string[];
  meanSpendingMinor: string;
  medianSpendingMinor: string;
  meanIncomeMinor: string;
  medianIncomeMinor: string;
  percentile25IncomeMinor: string | null;
  currency: string;
  isVariableIncome: boolean;
  insufficientHistory: boolean;
}

export interface BaselinesCalculationInput {
  months: readonly MonthBaselineInput[];
  currentMonth: string; // YYYY-MM
  scopeAccountIds?: readonly string[];
}

export interface BaselinesCalculationResult {
  calculatedAt: string;
  windows: MonthBaselineWindow[];
  proposedBaselineSpendingMinor: string | null;
  proposedBaselineIncomeMinor: string | null;
  requiresIncomeConfirmation: boolean;
  insufficientHistory: boolean;
  scopeAccountIds: string[];
}

function medianBigInt(values: readonly bigint[]): bigint {
  if (values.length === 0) return 0n;
  const sorted = [...values].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) {
    return sorted[mid]!;
  }
  return (sorted[mid - 1]! + sorted[mid]! + 1n) / 2n;
}

function meanBigInt(values: readonly bigint[]): bigint {
  if (values.length === 0) return 0n;
  const sum = values.reduce((acc, v) => acc + v, 0n);
  const count = BigInt(values.length);
  // HALF_UP rounding
  return (sum * 2n + count) / (count * 2n);
}

/**
 * Calculates 25th percentile using nearest-rank method:
 * rank = ceil(0.25 * n)
 * Returns values[rank - 1] from sorted ascending list.
 */
function nearestRank25thPercentile(values: readonly bigint[]): bigint {
  if (values.length === 0) return 0n;
  const sorted = [...values].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  const rank = Math.ceil(0.25 * sorted.length);
  const index = Math.max(0, Math.min(sorted.length - 1, rank - 1));
  return sorted[index]!;
}

/**
 * Calculates deterministic 3, 6, and 12 complete-month baselines.
 * Missing coverage is missing data, not zero spend/income.
 * Genuine zero-income complete months count.
 */
export function calculateBaselines(
  input: BaselinesCalculationInput,
): BaselinesCalculationResult {
  const calculatedAt = new Date().toISOString();
  const scopeAccountIds = [...(input.scopeAccountIds ?? [])];

  // Map input months by YYYY-MM
  const monthMap = new Map<string, MonthBaselineInput>();
  for (const m of input.months) {
    monthMap.set(m.month, m);
  }

  // Windows to evaluate
  const windowSizes: Array<3 | 6 | 12> = [3, 6, 12];
  const windows: MonthBaselineWindow[] = [];

  for (const size of windowSizes) {
    // Generate consecutive preceding months ending before currentMonth
    // e.g. for currentMonth 2026-10 and size 3: previousMonths('2026-10', 4) -> slice 0..3
    let consecutiveMonths: string[];
    try {
      const allPrev = previousMonths(input.currentMonth, size + 1);
      consecutiveMonths = allPrev.slice(0, size);
    } catch {
      consecutiveMonths = [];
    }

    // Check if all consecutive months exist and are complete
    const monthData: MonthBaselineInput[] = [];
    let isComplete = consecutiveMonths.length === size;

    for (const monthStr of consecutiveMonths) {
      const data = monthMap.get(monthStr);
      if (!data || !data.complete) {
        isComplete = false;
        break;
      }
      monthData.push(data);
    }

    if (!isComplete) {
      windows.push({
        windowMonths: size,
        complete: false,
        months: consecutiveMonths,
        meanSpendingMinor: "0",
        medianSpendingMinor: "0",
        meanIncomeMinor: "0",
        medianIncomeMinor: "0",
        percentile25IncomeMinor: null,
        currency: "GBP",
        isVariableIncome: false,
        insufficientHistory: true,
      });
      continue;
    }

    const spendingVals = monthData.map((m) => BigInt(m.spendingMinor));
    const incomeVals = monthData.map((m) => BigInt(m.incomeMinor));

    const meanSpend = meanBigInt(spendingVals);
    const medianSpend = medianBigInt(spendingVals);
    const meanInc = meanBigInt(incomeVals);
    const medianInc = medianBigInt(incomeVals);

    const isVariableIncome = incomeVals.some((v) => v !== incomeVals[0]);

    let percentile25: string | null = null;
    if (size === 12) {
      percentile25 = nearestRank25thPercentile(incomeVals).toString();
    }

    windows.push({
      windowMonths: size,
      complete: true,
      months: consecutiveMonths,
      meanSpendingMinor: meanSpend.toString(),
      medianSpendingMinor: medianSpend.toString(),
      meanIncomeMinor: meanInc.toString(),
      medianIncomeMinor: medianInc.toString(),
      percentile25IncomeMinor: percentile25,
      currency: "GBP",
      isVariableIncome,
      insufficientHistory: false,
    });
  }

  // Check 3-month baseline
  const window3 = windows.find((w) => w.windowMonths === 3);
  const hasComplete3 = window3?.complete ?? false;

  let proposedBaselineSpendingMinor: string | null = null;
  let proposedBaselineIncomeMinor: string | null = null;
  let requiresIncomeConfirmation = false;

  if (hasComplete3 && window3) {
    proposedBaselineSpendingMinor = window3.meanSpendingMinor;
    proposedBaselineIncomeMinor = window3.medianIncomeMinor;
    requiresIncomeConfirmation = window3.isVariableIncome;
  }

  return {
    calculatedAt,
    windows,
    proposedBaselineSpendingMinor,
    proposedBaselineIncomeMinor,
    requiresIncomeConfirmation,
    insufficientHistory: !hasComplete3,
    scopeAccountIds,
  };
}
