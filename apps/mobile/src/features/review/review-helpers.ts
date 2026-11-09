import type { CoverageReason, SpendingReport } from "@joint/contracts";

export const COVERAGE_REASONS: Record<CoverageReason, string> = {
  MISSING_HISTORY: "History has not been confirmed for every selected account.",
  OPEN_PERIOD: "This month is still open. Its figures will change.",
  UNREVIEWED: "Some financial classifications need an owner's review.",
  UNCLASSIFIED: "Some cash movements have no financial classification.",
  UNKNOWN_DEBT_SERVICE:
    "Debt payments need a principal and interest breakdown.",
  NO_ACCOUNTS: "No accounts with Values and details access are available.",
};

export interface AccountScopeItem {
  id: string;
  label: string;
  ownership: "OWNED" | "SHARED";
  coverage: {
    complete: boolean;
    version: number;
    reviewedAt: string | null;
  };
}

/**
 * Returns true if the user can toggle coverage for the account.
 * Rule: Only the owner can attest.
 * An incomplete account can only be marked complete once the month is closed.
 * An already complete account can be marked incomplete anytime by its owner.
 */
export function canAttestCoverage(
  account: Pick<AccountScopeItem, "ownership" | "coverage">,
  closedPeriod: boolean,
): boolean {
  if (account.ownership !== "OWNED") return false;
  if (!account.coverage.complete && !closedPeriod) return false;
  return true;
}

export function formatOwnershipLabel(ownership: "OWNED" | "SHARED"): string {
  return ownership === "OWNED" ? "Yours" : "Shared with you";
}

export function formatCoverageStatus(complete: boolean): string {
  return complete ? "History confirmed" : "History unconfirmed";
}

export function formatAttestButtonLabel(
  complete: boolean,
  pending: boolean,
): string {
  if (pending) return "Saving…";
  return complete ? "Mark history incomplete" : "Confirm whole-month history";
}

export function sortedCategoriesBySpend(report: SpendingReport) {
  if (!report.summary?.categories) return [];
  return [...report.summary.categories].sort((a, b) => {
    const valA = BigInt(a.spending.amountMinor);
    const absA = valA < 0n ? -valA : valA;
    const valB = BigInt(b.spending.amountMinor);
    const absB = valB < 0n ? -valB : valB;
    if (absB > absA) return 1;
    if (absB < absA) return -1;
    return 0;
  });
}
