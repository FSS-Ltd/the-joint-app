import {
  aggregateMoneySchema,
  bookedDateSchema,
  goalAllocationSchema,
  idempotencyKeySchema,
  type AggregateMoney,
} from "@joint/contracts";
import type {
  AllocationAssessment,
  AllocationAssessmentInput,
  AllocationIntent,
  ValuationBasis,
} from "./funding-types.js";
import { assessFundingSource, sourceMinor } from "./funding-source.js";

function invalid(): never {
  throw new Error("Invalid funding input");
}
function canonicalId(value: string): string {
  if (!idempotencyKeySchema.safeParse(value).success) return invalid();
  return value.toLowerCase();
}
function money(amount: bigint): AggregateMoney {
  const result = aggregateMoneySchema.safeParse({
    amountMinor: amount.toString(),
    currency: "GBP",
  });
  return result.success ? result.data : invalid();
}
function unavailable(allowed = false): AllocationAssessment {
  return {
    allowed,
    status: "UNAVAILABLE",
    reason: "FUNDING_UNAVAILABLE",
    available: null,
    committed: null,
    proposed: null,
    shortfall: null,
  };
}
function intent(value: AllocationIntent, accountId: string): AllocationIntent {
  const { goalId, ...allocation } = value;
  const parsed = goalAllocationSchema.safeParse(allocation);
  if (!parsed.success || canonicalId(allocation.accountId) !== accountId)
    return invalid();
  return {
    ...parsed.data,
    accountId,
    goalId: canonicalId(goalId),
    valuationId: canonicalId(allocation.valuationId),
  };
}
function bases(
  input: readonly ValuationBasis[],
  accountId: string,
): Map<string, bigint> {
  const result = new Map<string, bigint>();
  for (const value of input) {
    const id = canonicalId(value.valuationId),
      amount = sourceMinor(value.settledAdultMoney);
    if (
      canonicalId(value.accountId) !== accountId ||
      result.has(id) ||
      amount === null ||
      amount < 0n
    )
      return invalid();
    result.set(id, amount);
  }
  return result;
}
function resolve(
  claim: AllocationIntent,
  values: ReadonlyMap<string, bigint>,
): bigint | null {
  if (claim.basis === "FIXED") return BigInt(claim.amount.amountMinor);
  const base = values.get(claim.valuationId);
  if (base === undefined) return null;
  const [whole, decimal = ""] = claim.fraction.split(".");
  const scale = 1000000000000n;
  const fraction =
    BigInt(whole ?? "0") * scale + BigInt(decimal.padEnd(12, "0"));
  const product = base * fraction;
  return product / scale + ((product % scale) * 2n >= scale ? 1n : 0n);
}

/** Assesses intentions only. A scoped server transaction must independently authorize and lock every funding account. */
export function assessAllocationChange(
  input: AllocationAssessmentInput,
): AllocationAssessment {
  if (input.account.authority !== "OWNER") return unavailable();
  if (!bookedDateSchema.safeParse(input.asOfDate).success) return invalid();
  const accountId = canonicalId(input.account.id),
    goalId = canonicalId(input.replacementGoalId),
    latestId = canonicalId(input.account.latestValuationId);
  const existing = input.existing.map((value) => intent(value, accountId));
  if (new Set(existing.map((value) => value.goalId)).size !== existing.length)
    return invalid();
  const proposed =
    input.proposed === null ? null : intent(input.proposed, accountId);
  if (proposed && proposed.goalId !== goalId) return invalid();
  const values = bases(input.valuationBases, accountId);
  const settled = sourceMinor(input.account.settledAdultMoney);
  if (settled !== null && settled >= 0n) {
    if (values.has(latestId) && values.get(latestId) !== settled)
      return invalid();
    values.set(latestId, settled);
  }
  const source = assessFundingSource(input.account, input.asOfDate);
  if (!source || (proposed && proposed.valuationId !== latestId))
    return unavailable(proposed === null);
  let committed = 0n,
    previous = 0n;
  for (const claim of existing) {
    const amount = resolve(claim, values);
    if (amount === null) return unavailable(proposed === null);
    committed += amount;
    if (claim.goalId === goalId) previous = amount;
  }
  const replacement = proposed ? resolve(proposed, values) : 0n;
  if (replacement === null) return unavailable();
  const next = committed - previous + replacement;
  const shortfall = next > source.available ? next - source.available : 0n;
  const allowed = shortfall === 0n || replacement <= previous;
  return {
    allowed,
    status: shortfall === 0n ? "FUNDED" : "UNDERFUNDED",
    reason: allowed ? null : "ALLOCATION_EXCEEDS_AVAILABLE",
    available: money(source.available),
    committed: money(committed),
    proposed: money(next),
    shortfall: money(shortfall),
  };
}
