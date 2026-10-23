import { describe, expect, it } from "vitest";
import { assessAllocationChange } from "../packages/domain/src/goals/allocations.js";
import type {
  AllocationAssessmentInput,
  AllocationIntent,
  FundingAccount,
} from "../packages/domain/src/goals/funding-types.js";
const accountId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  goal1 = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  goal2 = "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
  valuation = "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
  oldValuation = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const money = (amountMinor: string) => ({
  amountMinor,
  currency: "GBP" as const,
});
function account(extra: Partial<FundingAccount> = {}): FundingAccount {
  return {
    id: accountId,
    kind: "SAVINGS",
    liquidity: "AVAILABLE",
    money: money("50000"),
    adultMoney: money("50000"),
    settledAdultMoney: money("50000"),
    billReserves: money("0"),
    latestValuationId: valuation,
    asOfDate: "2026-10-23",
    complete: true,
    authority: "OWNER",
    ...extra,
  };
}
function fixed(goalId = goal1, amount = "30000"): AllocationIntent {
  return {
    goalId,
    accountId,
    valuationId: valuation,
    basis: "FIXED",
    amount: money(amount),
  };
}
function fraction(value: string, id = valuation): AllocationIntent {
  return {
    goalId: goal1,
    accountId,
    valuationId: id,
    basis: "FRACTION",
    fraction: value,
  };
}
function assess(extra: Partial<AllocationAssessmentInput> = {}) {
  return assessAllocationChange({
    account: account(),
    asOfDate: "2026-10-23",
    replacementGoalId: goal1,
    existing: [],
    proposed: fixed(),
    valuationBases: [],
    ...extra,
  });
}
describe("pure allocation funding", () => {
  it("allows one £300 intention but denies two against £500 without changing records", () => {
    const first = fixed(),
      second = fixed(goal2),
      original = structuredClone(first);
    expect(assess().allowed).toBe(true);
    expect(
      assess({ replacementGoalId: goal2, existing: [first], proposed: second }),
    ).toMatchObject({
      allowed: false,
      status: "UNDERFUNDED",
      reason: "ALLOCATION_EXCEEDS_AVAILABLE",
      available: money("50000"),
      committed: money("30000"),
      proposed: money("60000"),
      shortfall: money("10000"),
    });
    expect(first).toEqual(original);
  });
  it("removes the replaced goal before checking its new claim", () => {
    expect(
      assess({ existing: [fixed()], proposed: fixed(goal1, "40000") }),
    ).toMatchObject({
      allowed: true,
      proposed: money("40000"),
      shortfall: money("0"),
    });
  });
  it("preserves underfunded intentions and permits reductions while denying increases", () => {
    const existing = [fixed(), fixed(goal2)];
    expect(assess({ existing, proposed: fixed() })).toMatchObject({
      allowed: true,
      status: "UNDERFUNDED",
      committed: money("60000"),
      shortfall: money("10000"),
    });
    expect(assess({ existing, proposed: fixed(goal1, "25000") })).toMatchObject(
      { allowed: true, proposed: money("55000"), shortfall: money("5000") },
    );
    expect(assess({ existing, proposed: fixed(goal1, "31000") })).toMatchObject(
      { allowed: false, reason: "ALLOCATION_EXCEEDS_AVAILABLE" },
    );
  });
  it("requires explicit adult settlement and subtracts reserves from mixed ownership", () => {
    const source = account({
      money: money("1000000"),
      adultMoney: money("700000"),
      settledAdultMoney: money("600000"),
      billReserves: money("100000"),
    });
    expect(assess({ account: source })).toMatchObject({
      allowed: true,
      available: money("500000"),
    });
    expect(
      assess({ account: account({ billReserves: money("90000") }) }),
    ).toMatchObject({
      allowed: false,
      available: money("0"),
      shortfall: money("30000"),
    });
  });
  it("withholds all totals for read-only grants, including release requests", () => {
    for (const proposed of [fixed(), null])
      expect(
        assess({
          account: account({ authority: "VIEW_ONLY" }),
          existing: [fixed()],
          proposed,
        }),
      ).toEqual({
        allowed: false,
        status: "UNAVAILABLE",
        reason: "FUNDING_UNAVAILABLE",
        available: null,
        committed: null,
        proposed: null,
        shortfall: null,
      });
  });
  it("permits an owner to release stale or unknown intentions without inventing amounts", () => {
    for (const source of [
      account({ adultMoney: null }),
      account({ asOfDate: "2026-09-01" }),
    ])
      expect(
        assess({ account: source, existing: [fixed()], proposed: null }),
      ).toMatchObject({
        allowed: true,
        status: "UNAVAILABLE",
        available: null,
        proposed: null,
      });
  });
  it("cannot fund from unavailable, unsupported or ineligible source evidence", () => {
    for (const source of [
      account({ adultMoney: null }),
      account({ settledAdultMoney: null }),
      account({ billReserves: null }),
      account({ asOfDate: "2026-09-22" }),
      account({ asOfDate: "2026-10-24" }),
      account({ asOfDate: "0000-01-01" }),
      account({ complete: false }),
      account({ money: { amountMinor: "50000", currency: "USD" } }),
      account({ liquidity: "RESTRICTED" }),
      ...(
        [
          "PROPERTY",
          "PENSION",
          "LOAN",
          "CREDIT_CARD",
          "MORTGAGE",
          "OTHER_LIABILITY",
        ] as const
      ).map((kind) => account({ kind })),
      account({ adultMoney: money("60000") }),
      account({ settledAdultMoney: money("60000") }),
      account({ billReserves: money("-1") }),
    ])
      expect(assess({ account: source })).toMatchObject({
        allowed: false,
        status: "UNAVAILABLE",
        reason: "FUNDING_UNAVAILABLE",
        available: null,
      });
    expect(
      assess({ account: account({ asOfDate: "2026-09-23" }) }).allowed,
    ).toBe(true);
  });
  it("never turns earmarked value or an overdraft into goal funding", () => {
    for (const source of [
      account({ adultMoney: money("0"), settledAdultMoney: money("0") }),
      account({
        money: money("-100"),
        adultMoney: money("-100"),
        settledAdultMoney: money("0"),
      }),
    ])
      expect(assess({ account: source })).toMatchObject({
        allowed: false,
        available: money("0"),
        reason: "ALLOCATION_EXCEEDS_AVAILABLE",
      });
  });
  it("retains a named historical fraction base after the latest valuation falls", () => {
    const source = account({
      money: money("5000"),
      adultMoney: money("5000"),
      settledAdultMoney: money("5000"),
    });
    const existing = [fraction("0.25", oldValuation)],
      bases = [
        {
          accountId,
          valuationId: oldValuation,
          settledAdultMoney: money("10000"),
        },
      ];
    expect(
      assess({
        account: source,
        replacementGoalId: goal2,
        existing,
        proposed: null,
        valuationBases: bases,
      }),
    ).toMatchObject({ committed: money("2500"), proposed: money("2500") });
    expect(
      assess({ account: source, existing, proposed: fixed(goal1, "1") }),
    ).toMatchObject({ status: "UNAVAILABLE", allowed: false });
    expect(
      assess({
        account: source,
        proposed: fraction("0.25", oldValuation),
        valuationBases: bases,
      }),
    ).toMatchObject({ status: "UNAVAILABLE", allowed: false });
  });
  it("rounds fractions HALF_UP once with exact 12-decimal and int64 arithmetic", () => {
    const small = account({
      money: money("1"),
      adultMoney: money("1"),
      settledAdultMoney: money("1"),
    });
    expect(
      assess({ account: small, proposed: fraction("0.5") }).proposed,
    ).toEqual(money("1"));
    expect(
      assess({ account: small, proposed: fraction("0.25") }).proposed,
    ).toEqual(money("0"));
    const large = account({
      money: money("9223372036854775807"),
      adultMoney: money("9223372036854775807"),
      settledAdultMoney: money("9223372036854775807"),
    });
    expect(
      assess({ account: large, proposed: fraction("0.5") }).proposed,
    ).toEqual(money("4611686018427387904"));
    expect(
      assess({ account: large, proposed: fraction("0.000000000001") }).proposed,
    ).toEqual(money("9223372"));
  });
  it("rejects malformed intentions and contradictory identities with safe errors", () => {
    const bad: AllocationAssessmentInput[] = [
      {
        account: account(),
        asOfDate: "bad",
        replacementGoalId: goal1,
        existing: [],
        proposed: fixed(),
        valuationBases: [],
      },
      ...[
        "0",
        "0.250",
        "1.01",
        "1e-2",
        "0.0000000000001",
        "SECRET_INVALID_FRACTION",
      ].map((value) => ({
        account: account(),
        asOfDate: "2026-10-23",
        replacementGoalId: goal1,
        existing: [],
        proposed: fraction(value),
        valuationBases: [],
      })),
      {
        account: account(),
        asOfDate: "2026-10-23",
        replacementGoalId: goal1,
        existing: [fixed(), fixed(goal1.toUpperCase())],
        proposed: fixed(),
        valuationBases: [],
      },
      {
        account: account(),
        asOfDate: "2026-10-23",
        replacementGoalId: goal1,
        existing: [],
        proposed: { ...fixed(), accountId: goal2 },
        valuationBases: [],
      },
      {
        account: account(),
        asOfDate: "2026-10-23",
        replacementGoalId: goal1,
        existing: [],
        proposed: fixed(),
        valuationBases: [
          {
            accountId,
            valuationId: oldValuation,
            settledAdultMoney: money("100"),
          },
          {
            accountId,
            valuationId: oldValuation,
            settledAdultMoney: money("200"),
          },
        ],
      },
    ];
    for (const input of bad)
      expect(() => assessAllocationChange(input)).toThrow(
        /^Invalid funding input$/,
      );
  });
});
