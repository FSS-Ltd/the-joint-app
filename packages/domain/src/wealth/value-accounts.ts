import {
  moneySchema,
  wealthSummaryDtoSchema,
  type WealthSummaryDto,
} from "@joint/contracts";
import { isLiabilityKind } from "../index.js";
import type { ScopedWealthAccount, WealthValuationInput } from "./types.js";
export type { ScopedWealthAccount, WealthValuationInput } from "./types.js";

type ExcludedReason = WealthSummaryDto["excludedReasons"][number];

function evidenceKey(account: ScopedWealthAccount): string {
  const snapshot = account.snapshot;
  return JSON.stringify([
    account.kind,
    account.legalOwnerKind,
    account.liquidity,
    account.totalsVersion,
    snapshot && [
      snapshot.id.toLowerCase(),
      snapshot.money.amountMinor,
      snapshot.money.currency,
      snapshot.adultMoney?.amountMinor ?? null,
      snapshot.adultMoney?.currency ?? null,
      snapshot.asOfDate,
      snapshot.complete,
      snapshot.source,
    ],
  ]);
}
function uniqueAccounts(
  input: readonly ScopedWealthAccount[],
): ScopedWealthAccount[] {
  const unique = new Map<string, ScopedWealthAccount>();
  for (const account of input) {
    const id = account.id.toLowerCase();
    const previous = unique.get(id);
    if (previous && evidenceKey(previous) !== evidenceKey(account))
      throw new Error("Conflicting account evidence");
    unique.set(id, { ...account, id });
  }
  if (unique.size > 50)
    throw new Error("Wealth scope exceeds the supported limit");
  return [...unique.values()].sort((a, b) =>
    a.id < b.id ? -1 : a.id > b.id ? 1 : 0,
  );
}
function contribution(
  account: ScopedWealthAccount,
  asOfDate: string,
): bigint | ExcludedReason {
  const snapshot = account.snapshot;
  if (!snapshot) return "MISSING_VALUATION";
  if (
    snapshot.money.currency !== "GBP" ||
    (snapshot.adultMoney && snapshot.adultMoney.currency !== "GBP")
  )
    return "UNSUPPORTED_CURRENCY";
  if (!snapshot.complete) return "INCOMPLETE_VALUATION";
  const age =
    (Date.parse(`${asOfDate}T00:00:00Z`) -
      Date.parse(`${snapshot.asOfDate}T00:00:00Z`)) /
    86400000;
  if (age < 0) return "FUTURE_VALUATION";
  if (age > 30) return "STALE_VALUATION";
  const original = moneySchema.safeParse(snapshot.money);
  if (!original.success) return "INVALID_VALUATION";
  if (snapshot.adultMoney === null) return "UNKNOWN_ADULT_PORTION";
  const adult = moneySchema.safeParse(snapshot.adultMoney);
  if (!adult.success) return "INVALID_VALUATION";
  const amount = BigInt(original.data.amountMinor);
  const portion = BigInt(adult.data.amountMinor);
  const liability = isLiabilityKind(account.kind);
  if (
    (amount < 0n &&
      (portion !== amount || !["CURRENT", "SAVINGS"].includes(account.kind))) ||
    (amount >= 0n && (portion < 0n || portion > amount)) ||
    (liability && (amount < 0n || portion !== amount))
  )
    return "INVALID_VALUATION";
  return liability ? -portion : portion;
}

/** Values owner-attested manual evidence; dates and authorization are supplied by the caller. */
export function valueAccounts(input: WealthValuationInput): WealthSummaryDto {
  const accounts = uniqueAccounts(input.accounts);
  const reasons = new Set<ExcludedReason>();
  if (accounts.length === 0) reasons.add("NO_ACCOUNTS");
  let net = 0n,
    liquid = 0n,
    contributors = 0;
  for (const account of accounts) {
    const value = contribution(account, input.asOfDate);
    if (typeof value === "string") {
      reasons.add(value);
      continue;
    }
    contributors++;
    net += value;
    if (
      value > 0n &&
      !isLiabilityKind(account.kind) &&
      !["PROPERTY", "PENSION"].includes(account.kind) &&
      account.liquidity === "AVAILABLE"
    )
      liquid += value;
  }
  return wealthSummaryDtoSchema.parse({
    schema: "wealth-summary",
    schemaVersion: 1,
    householdId: input.householdId,
    scope: {
      kind: "VISIBLE",
      accountIds: accounts.map((a) => a.id),
      sources: accounts.map((a) => ({
        accountId: a.id,
        totalsVersion: a.totalsVersion,
        valuationId: a.snapshot?.id.toLowerCase() ?? null,
      })),
      grantVersion: input.grantVersion,
    },
    completeness: reasons.size === 0 ? "COMPLETE" : "PARTIAL",
    excludedReasons: [...reasons].sort(),
    valuations: accounts.flatMap((a) =>
      a.snapshot
        ? [
            {
              accountId: a.id,
              valuationId: a.snapshot.id.toLowerCase(),
              asOfDate: a.snapshot.asOfDate,
              source: a.snapshot.source,
            },
          ]
        : [],
    ),
    asOfDate: input.asOfDate,
    calculatedAt: input.calculatedAt,
    adultNetWorth: contributors
      ? { amountMinor: net.toString(), currency: "GBP" }
      : null,
    liquidAdultAssets: contributors
      ? { amountMinor: liquid.toString(), currency: "GBP" }
      : null,
  });
}
