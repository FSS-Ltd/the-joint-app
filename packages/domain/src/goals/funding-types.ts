import type {
  AccountResponse,
  AggregateMoney,
  goalAllocationSchema,
} from "@joint/contracts";
export interface SourceMoney {
  readonly amountMinor: string;
  readonly currency: string;
}
export interface FundingAccount {
  readonly id: string;
  readonly kind: AccountResponse["kind"];
  readonly liquidity: AccountResponse["liquidity"];
  readonly money: SourceMoney;
  readonly adultMoney: SourceMoney | null;
  readonly settledAdultMoney: SourceMoney | null;
  readonly billReserves: SourceMoney | null;
  readonly latestValuationId: string;
  readonly asOfDate: string;
  readonly complete: boolean;
  readonly authority: "OWNER" | "VIEW_ONLY";
}
export type AllocationIntent = ReturnType<typeof goalAllocationSchema.parse> & {
  readonly goalId: string;
};
export interface ValuationBasis {
  readonly accountId: string;
  readonly valuationId: string;
  readonly settledAdultMoney: SourceMoney;
}
export interface AllocationAssessmentInput {
  readonly account: FundingAccount;
  readonly asOfDate: string;
  readonly replacementGoalId: string;
  readonly existing: readonly AllocationIntent[];
  readonly proposed: AllocationIntent | null;
  readonly valuationBases: readonly ValuationBasis[];
}
export interface AllocationAssessment {
  allowed: boolean;
  status: "FUNDED" | "UNDERFUNDED" | "UNAVAILABLE";
  reason: null | "FUNDING_UNAVAILABLE" | "ALLOCATION_EXCEEDS_AVAILABLE";
  available: AggregateMoney | null;
  committed: AggregateMoney | null;
  proposed: AggregateMoney | null;
  shortfall: AggregateMoney | null;
}
