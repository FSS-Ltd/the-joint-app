import type { AccountResponse, GrantLevel } from "@joint/contracts";

export const kinds = {
  CURRENT: "Current account",
  SAVINGS: "Savings",
  CREDIT_CARD: "Credit card",
  LOAN: "Loan",
  MORTGAGE: "Mortgage",
  INVESTMENT: "Investment",
  PENSION: "Pension",
  PROPERTY: "Property",
  OTHER_ASSET: "Other asset",
  OTHER_LIABILITY: "Other liability",
} satisfies Record<AccountResponse["kind"], string>;
export const liquidityLabels = {
  AVAILABLE: "Available",
  RESTRICTED: "Restricted",
  LOCKED: "Locked",
} satisfies Record<AccountResponse["liquidity"], string>;
export const grantLabels = {
  NONE: "Private",
  TOTALS: "Values only",
  TRANSACTIONS: "Values and details",
} satisfies Record<GrantLevel, string>;
export function ownerLabel(account: AccountResponse): string {
  if (account.legalOwnerKind === "JOINT_ADULT") return "Joint adult ownership";
  return account.ownership === "OWNED"
    ? "Sole owner: you"
    : "Owner: other household adult";
}
export function displayDate(value: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}T00:00:00Z`));
}
export function todayInLondon(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}
export function accountPath(householdId: string, accountId?: string): string {
  return `/api/households/${householdId}/accounts${accountId ? `/${accountId}` : ""}`;
}
