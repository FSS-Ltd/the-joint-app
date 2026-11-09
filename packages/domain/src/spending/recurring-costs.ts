import type { ClassificationKind } from "@joint/contracts";

export interface RecurringTransactionInput {
  id: string;
  accountId: string;
  currency: string;
  amountMinor: bigint | string;
  bookedDate: string; // YYYY-MM-DD
  description: string;
  merchant?: string | null;
  category?: string | null;
  classificationKind?: ClassificationKind | null;
  isOneOff?: boolean;
}

export type RecurringCadence = "WEEKLY" | "MONTHLY";
export type CandidateConfidence = "HIGH" | "MEDIUM" | "LOW";
export type CandidateStatus = "CANDIDATE" | "CONFIRMED" | "DISMISSED";

export interface RecurringCandidate {
  id: string;
  accountId: string;
  currency: string;
  normalisedMerchant: string;
  cadence: RecurringCadence;
  occurrenceCount: number;
  medianAmountMinor: string;
  meanAmountMinor: string;
  isVariable: boolean;
  firstDate: string;
  lastDate: string;
  confidence: CandidateConfidence;
  category: string | null;
  status: CandidateStatus;
}

export interface RecurringDetectionOptions {
  referenceDate?: string; // YYYY-MM-DD, defaults to latest transaction date or today
  windowDays?: number; // defaults to 180
}

export interface RecurringDetectionResult {
  candidates: RecurringCandidate[];
  calculatedAt: string;
  windowDays: number;
}

/**
 * Normalises a merchant name from merchant field and transaction description.
 */
export function normaliseMerchant(
  description: string,
  merchant?: string | null,
): string {
  const candidate =
    merchant && merchant.trim().length > 0 ? merchant : description;
  return candidate
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function parseDateDays(isoDate: string): number {
  const [y, m, d] = isoDate.split("-").map(Number);
  if (!y || !m || !d) return 0;
  // Use UTC midnight for exact whole day arithmetic
  return Math.floor(Date.UTC(y, m - 1, d) / (1000 * 60 * 60 * 24));
}

function medianBigInt(values: readonly bigint[]): bigint {
  if (values.length === 0) return 0n;
  const sorted = [...values].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) {
    return sorted[mid]!;
  }
  // Midpoint with half-up rounding
  return (sorted[mid - 1]! + sorted[mid]! + 1n) / 2n;
}

function medianNumber(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) {
    return sorted[mid]!;
  }
  return Math.round((sorted[mid - 1]! + sorted[mid]!) / 2);
}

/**
 * Pure recurring-cost detector over authorised booked transactions.
 * Operates strictly on consumption expenses within 180 days.
 */
export function detectRecurringCosts(
  transactions: readonly RecurringTransactionInput[],
  options: RecurringDetectionOptions = {},
): RecurringDetectionResult {
  const windowDays = options.windowDays ?? 180;
  const calculatedAt = new Date().toISOString();

  // Find reference date (explicit or latest bookedDate)
  let refDays: number;
  if (options.referenceDate) {
    refDays = parseDateDays(options.referenceDate);
  } else {
    refDays = transactions.reduce((max, tx) => {
      const days = parseDateDays(tx.bookedDate);
      return days > max ? days : max;
    }, 0);
  }
  const minDays = refDays - windowDays;

  // Filter valid consumption expenses within 180-day window
  const eligible = transactions.filter((tx) => {
    if (tx.isOneOff) return false;

    // Must be within window
    const days = parseDateDays(tx.bookedDate);
    if (days < minDays || days > refDays) return false;

    // Exclude non-expenses
    if (
      tx.classificationKind === "TRANSFER" ||
      tx.classificationKind === "REFUND" ||
      tx.classificationKind === "INCOME" ||
      tx.classificationKind === "PRINCIPAL" ||
      tx.classificationKind === "DEBT_PAYMENT" ||
      tx.classificationKind === "CONTRIBUTION" ||
      tx.classificationKind === "UNCLASSIFIED"
    ) {
      return false;
    }

    const amount = BigInt(tx.amountMinor);
    // Explicit EXPENSE or negative amount
    if (tx.classificationKind === "EXPENSE") {
      return amount < 0n;
    }
    return amount < 0n;
  });

  // Group by account, currency, normalised merchant
  const groups = new Map<
    string,
    {
      accountId: string;
      currency: string;
      normalisedMerchant: string;
      category: string | null;
      txs: Array<{ dateDays: number; date: string; amountAbs: bigint }>;
    }
  >();

  for (const tx of eligible) {
    const norm = normaliseMerchant(tx.description, tx.merchant);
    if (!norm) continue;

    const groupKey = `${tx.accountId}:${tx.currency}:${norm}`;
    let group = groups.get(groupKey);
    if (!group) {
      group = {
        accountId: tx.accountId,
        currency: tx.currency,
        normalisedMerchant: norm,
        category: tx.category ?? null,
        txs: [],
      };
      groups.set(groupKey, group);
    }
    const amountAbs =
      BigInt(tx.amountMinor) < 0n
        ? -BigInt(tx.amountMinor)
        : BigInt(tx.amountMinor);

    group.txs.push({
      dateDays: parseDateDays(tx.bookedDate),
      date: tx.bookedDate,
      amountAbs,
    });
  }

  const candidates: RecurringCandidate[] = [];

  for (const group of groups.values()) {
    // Requires at least 3 occurrences in 180 days
    if (group.txs.length < 3) continue;

    // Sort by date ascending
    const sorted = [...group.txs].sort((a, b) => a.dateDays - b.dateDays);

    // Calculate consecutive gaps in days
    const gaps: number[] = [];
    for (let i = 1; i < sorted.length; i++) {
      gaps.push(sorted[i]!.dateDays - sorted[i - 1]!.dateDays);
    }

    const medianGap = medianNumber(gaps);

    let cadence: RecurringCadence;
    if (medianGap >= 6 && medianGap <= 8) {
      cadence = "WEEKLY";
    } else if (medianGap >= 25 && medianGap <= 35) {
      cadence = "MONTHLY";
    } else {
      // Irregular, not recurring
      continue;
    }

    // Amounts analysis
    const amounts = sorted.map((t) => t.amountAbs);
    const medianAmt = medianBigInt(amounts);
    const totalAmt = amounts.reduce((sum, v) => sum + v, 0n);
    const count = BigInt(amounts.length);
    // HALF_UP rounding for mean minor
    const meanAmt = (totalAmt * 2n + count) / (count * 2n);

    const isVariable = amounts.some((a) => a !== amounts[0]);

    // Heuristic confidence
    let confidence: CandidateConfidence;
    if (
      !isVariable &&
      sorted.length >= 4 &&
      (medianGap === 7 || (medianGap >= 28 && medianGap <= 31))
    ) {
      confidence = "HIGH";
    } else if (
      isVariable ||
      (medianGap >= 6 && medianGap <= 8) ||
      (medianGap >= 25 && medianGap <= 35)
    ) {
      confidence = "MEDIUM";
    } else {
      confidence = "LOW";
    }

    const id = `${group.accountId}-${group.normalisedMerchant.replace(/\s+/g, "-")}`;

    candidates.push({
      id,
      accountId: group.accountId,
      currency: group.currency,
      normalisedMerchant: group.normalisedMerchant,
      cadence,
      occurrenceCount: sorted.length,
      medianAmountMinor: medianAmt.toString(),
      meanAmountMinor: meanAmt.toString(),
      isVariable,
      firstDate: sorted[0]!.date,
      lastDate: sorted[sorted.length - 1]!.date,
      confidence,
      category: group.category,
      status: "CANDIDATE",
    });
  }

  // Sort candidates by median amount descending
  candidates.sort((a, b) =>
    BigInt(b.medianAmountMinor) < BigInt(a.medianAmountMinor) ? -1 : 1,
  );

  return {
    candidates,
    calculatedAt,
    windowDays,
  };
}

export interface ProposedReduction {
  id: string;
  merchant: string;
  category?: string | null;
  proposedSavingMinor: string;
}

export interface CombinedReductionsResult {
  totalSavingMinor: string;
  items: ProposedReduction[];
}

/**
 * Combines overlapping proposed reductions without adding the same saving twice.
 */
export function combineProposedReductions(
  reductions: readonly ProposedReduction[],
): CombinedReductionsResult {
  const seenMerchants = new Set<string>();
  const items: ProposedReduction[] = [];
  let total = 0n;

  for (const red of reductions) {
    const key = red.merchant.trim().toLowerCase();
    if (seenMerchants.has(key)) {
      continue;
    }
    seenMerchants.add(key);
    items.push(red);
    total += BigInt(red.proposedSavingMinor);
  }

  return {
    totalSavingMinor: total.toString(),
    items,
  };
}
