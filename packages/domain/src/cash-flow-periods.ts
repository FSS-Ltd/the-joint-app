import type { CoverageReason } from "@joint/contracts";
export type { CoverageReason } from "@joint/contracts";
import { parseBookedDate } from "./transaction-normalisation.js";

export function monthBounds(month: string): {
  start: string;
  endExclusive: string;
} {
  if (
    !/^(?:000[1-9]|00[1-9]\d|0[1-9]\d{2}|[1-9]\d{3})-(?:0[1-9]|1[0-2])$/.test(
      month,
    ) ||
    month.startsWith("9999")
  )
    throw new Error("Use a calendar month from 0001-01 to 9998-12.");
  const year = Number(month.slice(0, 4));
  const monthNumber = Number(month.slice(5));
  return {
    start: `${month}-01`,
    endExclusive:
      monthNumber === 12
        ? `${String(year + 1).padStart(4, "0")}-01-01`
        : `${month.slice(0, 4)}-${String(monthNumber + 1).padStart(2, "0")}-01`,
  };
}
/** Ascending calendar periods, including the requested month. */
export function previousMonths(month: string, count: number): string[] {
  monthBounds(month);
  if (!Number.isSafeInteger(count) || count < 1 || count > 120)
    throw new Error("Use between one and 120 months.");
  const index =
    (Number(month.slice(0, 4)) - 1) * 12 + Number(month.slice(5)) - 1;
  if (index - count + 1 < 0)
    throw new Error("The requested history precedes the supported calendar.");
  return Array.from({ length: count }, (_, offset) => {
    const current = index - count + 1 + offset;
    return `${String(Math.floor(current / 12) + 1).padStart(4, "0")}-${String((current % 12) + 1).padStart(2, "0")}`;
  });
}
export interface CoverageInput {
  month: string;
  /** London's current calendar date, supplied explicitly by the caller. */
  today: string;
  accountCount: number;
  attestedAccountCount: number;
  unreviewedCount: number;
  unclassifiedCount: number;
  unknownDebtCount: number;
}
export interface CoverageAssessment {
  complete: boolean;
  reasons: CoverageReason[];
}
export function assessCoverage(input: CoverageInput): CoverageAssessment {
  const bounds = monthBounds(input.month);
  if (parseBookedDate(input.today, "ISO") !== input.today)
    throw new Error("Supply the current London calendar date.");
  for (const value of [
    input.accountCount,
    input.attestedAccountCount,
    input.unreviewedCount,
    input.unclassifiedCount,
    input.unknownDebtCount,
  ])
    if (!Number.isSafeInteger(value) || value < 0)
      throw new Error("Coverage counts must be nonnegative integers.");
  if (input.attestedAccountCount > input.accountCount)
    throw new Error("Attested accounts exceed the selected account scope.");
  const reasons: CoverageReason[] = [];
  if (input.accountCount === 0) reasons.push("NO_ACCOUNTS");
  if (bounds.endExclusive > input.today) reasons.push("OPEN_PERIOD");
  if (input.attestedAccountCount < input.accountCount)
    reasons.push("MISSING_HISTORY");
  if (input.unreviewedCount > 0) reasons.push("UNREVIEWED");
  if (input.unclassifiedCount > 0) reasons.push("UNCLASSIFIED");
  if (input.unknownDebtCount > 0) reasons.push("UNKNOWN_DEBT_SERVICE");
  return { complete: reasons.length === 0, reasons };
}
export function canComparePeriods(
  first: CoverageAssessment,
  second: CoverageAssessment,
): boolean {
  return first.complete && second.complete;
}
