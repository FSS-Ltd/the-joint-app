import type { AccountResponse } from "@joint/contracts";
interface SourceMoney {
  readonly amountMinor: string;
  readonly currency: string;
}
export interface ScopedWealthAccount {
  readonly id: string;
  readonly kind: AccountResponse["kind"];
  readonly legalOwnerKind: AccountResponse["legalOwnerKind"];
  readonly liquidity: AccountResponse["liquidity"];
  readonly totalsVersion: number;
  readonly snapshot: {
    readonly id: string;
    readonly money: SourceMoney;
    readonly adultMoney: SourceMoney | null;
    readonly asOfDate: string;
    readonly complete: boolean;
    readonly source: "MANUAL";
  } | null;
}
export interface WealthValuationInput {
  readonly householdId: string;
  readonly grantVersion: number;
  readonly asOfDate: string;
  readonly calculatedAt: string;
  readonly accounts: readonly ScopedWealthAccount[];
}
