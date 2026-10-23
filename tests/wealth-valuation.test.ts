import { describe, expect, it } from "vitest";
import { valueAccounts } from "../packages/domain/src/wealth/value-accounts.js";
import type {
  ScopedWealthAccount,
  WealthValuationInput,
} from "../packages/domain/src/wealth/types.js";
const householdId = "11111111-1111-4111-8111-111111111111";
const money = (amountMinor: string) => ({ amountMinor, currency: "GBP" });
function account(
  n: number,
  amount = "1000000",
  adult: string | null = amount,
  kind: ScopedWealthAccount["kind"] = "SAVINGS",
): ScopedWealthAccount {
  return {
    id: `22222222-2222-4222-8222-${String(n).padStart(12, "0")}`,
    kind,
    legalOwnerKind: "ADULT",
    liquidity: "AVAILABLE",
    totalsVersion: 2,
    snapshot: {
      id: `33333333-3333-4333-8333-${String(n).padStart(12, "0")}`,
      money: money(amount),
      adultMoney: adult === null ? null : money(adult),
      asOfDate: "2026-10-23",
      complete: true,
      source: "MANUAL",
    },
  };
}
function read(
  accounts: readonly ScopedWealthAccount[],
  extra: Partial<WealthValuationInput> = {},
) {
  return valueAccounts({
    householdId,
    grantVersion: 2,
    asOfDate: "2026-10-23",
    calculatedAt: "2026-10-23T12:00:00Z",
    accounts,
    ...extra,
  });
}
function snapshot(
  value: ScopedWealthAccount,
  changes: Partial<NonNullable<ScopedWealthAccount["snapshot"]>>,
): ScopedWealthAccount {
  if (!value.snapshot) throw Error("Synthetic snapshot required");
  return { ...value, snapshot: { ...value.snapshot, ...changes } };
}
describe("exact manual adult wealth", () => {
  it("counts adult £7,000 and excludes known earmarked £3,000 without changing originals", () => {
    const rows = [account(1, "700000"), account(2, "300000", "0")];
    const result = read(rows);
    expect(result.adultNetWorth).toEqual(money("700000"));
    expect(result.liquidAdultAssets).toEqual(money("700000"));
    expect(result.completeness).toBe("COMPLETE");
    const mixed = account(3, "1000000", "700000");
    expect(read([mixed]).adultNetWorth).toEqual(money("700000"));
    expect(mixed.snapshot?.money).toEqual(money("1000000"));
  });
  it("keeps unknown evidence different from known zero and reports valid partial subtotals", () => {
    const unknown = account(1, "1000000", null);
    expect(read([unknown])).toMatchObject({
      adultNetWorth: null,
      liquidAdultAssets: null,
      completeness: "PARTIAL",
      excludedReasons: ["UNKNOWN_ADULT_PORTION"],
    });
    expect(read([account(1, "1000000", "0")])).toMatchObject({
      adultNetWorth: money("0"),
      liquidAdultAssets: money("0"),
      completeness: "COMPLETE",
    });
    expect(read([unknown, account(2, "500")])).toMatchObject({
      adultNetWorth: money("500"),
      completeness: "PARTIAL",
    });
    expect(read([])).toMatchObject({
      adultNetWorth: null,
      liquidAdultAssets: null,
      excludedReasons: ["NO_ACCOUNTS"],
    });
  });
  it("uses broker totals once and canonical joint accounts once", () => {
    const broker = account(1, "1000000", "1000000", "INVESTMENT");
    const joint = { ...broker, legalOwnerKind: "JOINT_ADULT" as const };
    expect(read([joint, joint]).adultNetWorth).toEqual(money("1000000"));
    expect(read([joint, joint]).scope.accountIds).toEqual([joint.id]);
    expect(() => read([joint, { ...joint, totalsVersion: 3 }])).toThrow(
      "Conflicting account evidence",
    );
  });
  it("subtracts separate positive outstanding debts once without counting them as liquid", () => {
    const property = account(1, "20000000", "20000000", "PROPERTY");
    const mortgage = account(2, "15000000", "15000000", "MORTGAGE");
    expect(read([property, mortgage])).toMatchObject({
      adultNetWorth: money("5000000"),
      liquidAdultAssets: money("0"),
    });
    expect(read([account(3, "5000", "5000", "LOAN")]).adultNetWorth).toEqual(
      money("-5000"),
    );
  });
  it("counts current and savings overdrafts once and excludes restricted capital from liquid totals", () => {
    for (const kind of ["CURRENT", "SAVINGS"] as const)
      expect(read([account(1, "-50000", "-50000", kind)])).toMatchObject({
        adultNetWorth: money("-50000"),
        liquidAdultAssets: money("0"),
      });
    for (const kind of ["PENSION", "PROPERTY"] as const)
      expect(read([account(1, "2000000", "2000000", kind)])).toMatchObject({
        adultNetWorth: money("2000000"),
        liquidAdultAssets: money("0"),
      });
    expect(
      read([{ ...account(1), liquidity: "RESTRICTED" }]).liquidAdultAssets,
    ).toEqual(money("0"));
  });
  it("preserves exact sums beyond int64 without floating point", () => {
    expect(
      read([
        account(1, "9223372036854775807"),
        account(2, "9223372036854775807"),
      ]).adultNetWorth,
    ).toEqual(money("18446744073709551614"));
  });
  it("accepts 30 calendar days and excludes stale, future, incomplete and missing evidence", () => {
    const a = account(1);
    expect(read([snapshot(a, { asOfDate: "2026-09-23" })]).completeness).toBe(
      "COMPLETE",
    );
    for (const [value, reason] of [
      [snapshot(a, { asOfDate: "2026-09-22" }), "STALE_VALUATION"],
      [snapshot(a, { asOfDate: "2026-10-24" }), "FUTURE_VALUATION"],
      [snapshot(a, { complete: false }), "INCOMPLETE_VALUATION"],
      [{ ...a, snapshot: null }, "MISSING_VALUATION"],
      [
        snapshot(a, { money: { amountMinor: "1000000", currency: "USD" } }),
        "UNSUPPORTED_CURRENCY",
      ],
    ] as const) {
      expect(read([value])).toMatchObject({
        adultNetWorth: null,
        liquidAdultAssets: null,
        completeness: "PARTIAL",
        excludedReasons: [reason],
      });
    }
    const stale = read([snapshot(a, { asOfDate: "2026-09-22" })]);
    expect(stale.valuations[0]?.asOfDate).toBe("2026-09-22");
  });
  it("rejects invalid balances instead of normalizing them into assets", () => {
    for (const a of [
      account(1, "-100", "-100", "INVESTMENT"),
      account(1, "-100", "-100", "LOAN"),
      account(1, "100", "99", "LOAN"),
      account(1, "100", "101"),
      account(1, "-100", "0"),
      account(1, "invalid", "0"),
    ]) {
      expect(read([a])).toMatchObject({
        adultNetWorth: null,
        completeness: "PARTIAL",
        excludedReasons: ["INVALID_VALUATION"],
      });
    }
  });
  it("returns stable sorted provenance across input order and host time zone", () => {
    const rows = [account(2), account(1)];
    const original = process.env.TZ;
    try {
      process.env.TZ = "Pacific/Auckland";
      const first = read(rows);
      process.env.TZ = "America/Los_Angeles";
      const second = read([...rows].reverse());
      expect(second).toEqual(first);
      expect(first.scope.sources).toEqual(
        [...rows].reverse().map((a) => ({
          accountId: a.id,
          totalsVersion: a.totalsVersion,
          valuationId: a.snapshot?.id ?? null,
        })),
      );
    } finally {
      if (original === undefined) delete process.env.TZ;
      else process.env.TZ = original;
    }
  });
});
