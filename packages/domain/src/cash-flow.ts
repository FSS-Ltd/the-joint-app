import {
  moneySchema,
  aggregateMinorSchema,
  type ClassificationKind,
  type AggregateMoney,
  type SpendSummary,
  type AccountResponse,
  type Money,
} from "@joint/contracts";

export type {
  ClassificationKind,
  AggregateMoney,
  SpendSummary,
} from "@joint/contracts";
/** An authorised source component, or a SQL group with one kind and direction. */
export interface CashFlowComponent {
  amountMinor: string;
  currency: "GBP";
  accountKind: AccountResponse["kind"];
  classificationKind: ClassificationKind | null;
  category: string | null;
  confirmed: boolean;
  count?: number;
  aggregated?: boolean;
  grouped?: boolean;
  status?: "BOOKED" | "PENDING" | "SUPERSEDED" | "REVERSED";
  published?: boolean;
}

function aggregateValue(value: string): bigint {
  return BigInt(aggregateMinorSchema.parse(value));
}

function aggregateMoney(amount: bigint): AggregateMoney {
  const amountMinor = amount.toString();
  aggregateValue(amountMinor);
  return { amountMinor, currency: "GBP" };
}
export function validateClassificationKind(
  amountMinor: string,
  kind: ClassificationKind | null,
): void {
  const amount = aggregateValue(amountMinor);
  if (
    (kind === "EXPENSE" && amount >= 0n) ||
    ((kind === "INCOME" || kind === "REFUND") && amount <= 0n)
  )
    throw new Error("Classification does not match the amount's direction.");
}
export function effectiveClassification(
  accountKind: AccountResponse["kind"],
  amountMinor: string,
  kind: ClassificationKind | null,
): { kind: ClassificationKind; provisional: boolean } {
  validateClassificationKind(amountMinor, kind);
  if (kind !== null) return { kind, provisional: false };
  const defaultExpense =
    aggregateValue(amountMinor) < 0n &&
    ["CURRENT", "SAVINGS", "CREDIT_CARD"].includes(accountKind);
  return {
    kind: defaultExpense ? "EXPENSE" : "UNCLASSIFIED",
    provisional: true,
  };
}
function addCount(current: number, addition: number): number {
  const next = current + addition;
  if (!Number.isSafeInteger(next) || addition < 1)
    throw new Error("Component count is outside the supported range.");
  return next;
}

/** Financial values stay in minor-unit BigInts; counts describe components, not unique rows. */
export function summariseSpending(
  input: readonly CashFlowComponent[],
): SpendSummary {
  const totals = {
    spending: 0n,
    income: 0n,
    transferIn: 0n,
    transferOut: 0n,
    debtServiceOut: 0n,
    debtSettlementIn: 0n,
    principalIn: 0n,
    principalOut: 0n,
    contributionIn: 0n,
    contributionOut: 0n,
    unclassifiedIn: 0n,
    unclassifiedOut: 0n,
    netCash: 0n,
  };
  const categories = new Map<
    string,
    { category: string | null; grouped: boolean; amount: bigint; count: number }
  >();
  let unreviewedCount = 0;
  let unclassifiedCount = 0;
  let unknownDebtCount = 0;
  for (const row of input) {
    if (
      (row.status !== undefined && row.status !== "BOOKED") ||
      row.published === false
    )
      continue;
    const amount = row.aggregated
      ? aggregateValue(row.amountMinor)
      : BigInt(
          moneySchema.parse({
            amountMinor: row.amountMinor,
            currency: row.currency,
          }).amountMinor,
        );
    if (row.currency !== "GBP")
      throw new Error("Only GBP components are supported.");
    const count = row.count ?? 1;
    addCount(0, count);
    const effective = effectiveClassification(
      row.accountKind,
      row.amountMinor,
      row.classificationKind,
    );
    if (amount === 0n) continue;
    if (effective.provisional || !row.confirmed)
      unreviewedCount = addCount(unreviewedCount, count);
    totals.netCash += amount;
    const incoming = amount > 0n;
    const magnitude = incoming ? amount : -amount;
    switch (effective.kind) {
      case "EXPENSE":
      case "REFUND": {
        totals.spending -= amount;
        const grouped = row.grouped ?? false;
        const key = JSON.stringify([row.category, grouped]);
        const previous = categories.get(key) ?? {
          category: row.category,
          grouped,
          amount: 0n,
          count: 0,
        };
        categories.set(key, {
          ...previous,
          amount: previous.amount - amount,
          count: addCount(previous.count, count),
        });
        break;
      }
      case "INCOME":
        totals.income += amount;
        break;
      case "TRANSFER":
        totals[incoming ? "transferIn" : "transferOut"] += magnitude;
        break;
      case "DEBT_PAYMENT":
        totals[incoming ? "debtSettlementIn" : "debtServiceOut"] += magnitude;
        unknownDebtCount = addCount(unknownDebtCount, count);
        break;
      case "PRINCIPAL":
        totals[incoming ? "principalIn" : "principalOut"] += magnitude;
        break;
      case "CONTRIBUTION":
        totals[incoming ? "contributionIn" : "contributionOut"] += magnitude;
        break;
      case "UNCLASSIFIED":
        totals[incoming ? "unclassifiedIn" : "unclassifiedOut"] += magnitude;
        unclassifiedCount = addCount(unclassifiedCount, count);
        if (
          !incoming &&
          ["LOAN", "MORTGAGE", "OTHER_LIABILITY"].includes(row.accountKind)
        )
          unknownDebtCount = addCount(unknownDebtCount, count);
        break;
    }
  }
  return {
    spending: aggregateMoney(totals.spending),
    income: aggregateMoney(totals.income),
    transferIn: aggregateMoney(totals.transferIn),
    transferOut: aggregateMoney(totals.transferOut),
    debtServiceOut: aggregateMoney(totals.debtServiceOut),
    debtSettlementIn: aggregateMoney(totals.debtSettlementIn),
    principalIn: aggregateMoney(totals.principalIn),
    principalOut: aggregateMoney(totals.principalOut),
    contributionIn: aggregateMoney(totals.contributionIn),
    contributionOut: aggregateMoney(totals.contributionOut),
    unclassifiedIn: aggregateMoney(totals.unclassifiedIn),
    unclassifiedOut: aggregateMoney(totals.unclassifiedOut),
    netCash: aggregateMoney(totals.netCash),
    categories: [...categories.values()]
      .map((value) => ({
        category: value.category,
        grouped: value.grouped,
        spending: aggregateMoney(value.amount),
        count: value.count,
      }))
      .sort(
        (a, b) =>
          b.count - a.count ||
          (a.category ?? "").localeCompare(b.category ?? "", "en-GB"),
      ),
    unreviewedCount,
    unclassifiedCount,
    unknownDebtCount,
    consumptionComplete:
      unreviewedCount === 0 &&
      unclassifiedCount === 0 &&
      unknownDebtCount === 0,
  };
}

export interface SplitComponent {
  money: Money;
  classificationKind: ClassificationKind;
  category: string | null;
}
export function validateSplits(
  parent: Money,
  lines: readonly SplitComponent[],
): void {
  const parentAmount = BigInt(moneySchema.parse(parent).amountMinor);
  if (lines.length === 0) return;
  if (parentAmount === 0n)
    throw new Error("Zero transactions cannot have split components.");
  if (lines.length < 2 || lines.length > 20)
    throw new Error("Use between two and twenty split components.");
  let sum = 0n;
  for (const line of lines) {
    const amount = BigInt(moneySchema.parse(line.money).amountMinor);
    if (amount === 0n) throw new Error("Split components must be nonzero.");
    validateClassificationKind(line.money.amountMinor, line.classificationKind);
    sum += amount;
  }
  if (sum !== parentAmount)
    throw new Error(
      "Split components must sum exactly to the transaction amount.",
    );
}
export function formatAggregateMoney(money: AggregateMoney): string {
  if (money.currency !== "GBP")
    throw new Error("Only GBP amounts are supported.");
  const value = aggregateValue(money.amountMinor);
  const magnitude = value < 0n ? -value : value;
  return `${value < 0n ? "-" : ""}£${new Intl.NumberFormat("en-GB").format(magnitude / 100n)}.${(magnitude % 100n).toString().padStart(2, "0")}`;
}
/** Only the final bounded visual dimension crosses into Number arithmetic. */
export function chartRatio(value: string, total: string, scale = 1000): number {
  const numerator = aggregateValue(value);
  const denominator = aggregateValue(total);
  if (!Number.isSafeInteger(scale) || scale < 1 || scale > 1000000)
    throw new Error("Chart scale is outside the supported range.");
  if (numerator <= 0n || denominator <= 0n) return 0;
  if (numerator >= denominator) return scale;
  return Number((numerator * BigInt(scale)) / denominator);
}
export {
  monthBounds,
  previousMonths,
  assessCoverage,
  canComparePeriods,
} from "./cash-flow-periods.js";
export type { CoverageAssessment, CoverageInput } from "./cash-flow-periods.js";
