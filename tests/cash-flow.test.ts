import { describe, expect, it } from "vitest";
import {
  summariseSpending,
  validateSplits,
  monthBounds,
  previousMonths,
  assessCoverage,
  canComparePeriods,
  formatAggregateMoney,
  chartRatio,
  effectiveClassification,
  validateClassificationKind,
  type CashFlowComponent,
} from "../packages/domain/src/cash-flow.js";

function component(
  amountMinor: string,
  classificationKind: CashFlowComponent["classificationKind"],
  rest: Partial<CashFlowComponent> = {},
): CashFlowComponent {
  return {
    amountMinor,
    currency: "GBP",
    accountKind: "CURRENT",
    classificationKind,
    category: null,
    confirmed: classificationKind !== null,
    ...rest,
  };
}
const gbp = (amountMinor: string) => ({
  amountMinor,
  currency: "GBP" as const,
});

describe("exact cash flow", () => {
  it("excludes both owned transfer legs from consumption", () => {
    const result = summariseSpending([
      component("-50000", "TRANSFER"),
      component("50000", "TRANSFER", { accountKind: "SAVINGS" }),
    ]);
    expect(result.spending).toEqual(gbp("0"));
    expect(result.netCash).toEqual(gbp("0"));
    expect(result.transferIn).toEqual(gbp("50000"));
    expect(result.transferOut).toEqual(gbp("50000"));
  });
  it("counts a card purchase once alongside a tracked settlement", () => {
    const result = summariseSpending([
      component("-12000", "EXPENSE", {
        accountKind: "CREDIT_CARD",
        category: "Food",
      }),
      component("-12000", "TRANSFER"),
      component("12000", "TRANSFER", { accountKind: "CREDIT_CARD" }),
    ]);
    expect(result.spending).toEqual(gbp("12000"));
    expect(result.categories).toEqual([
      { category: "Food", spending: gbp("12000"), grouped: false, count: 1 },
    ]);
    expect(result.netCash).toEqual(gbp("-12000"));
  });
  it("keeps a later refund in its own month, including negative category spending", () => {
    expect(
      summariseSpending([
        component("-5000", "EXPENSE", { category: "Clothes" }),
      ]).spending,
    ).toEqual(gbp("5000"));
    const february = summariseSpending([
      component("5000", "REFUND", { category: "Clothes" }),
    ]);
    expect(february.spending).toEqual(gbp("-5000"));
    expect(february.categories[0]?.spending).toEqual(gbp("-5000"));
  });
  it("defaults only known negative cash/card accounts to provisional expenses", () => {
    const result = summariseSpending([
      component("-100", null),
      component("-200", null, { accountKind: "SAVINGS" }),
      component("-300", null, { accountKind: "CREDIT_CARD" }),
      component("1000", null),
      component("-400", null, { accountKind: "INVESTMENT" }),
      component("-500", "DEBT_PAYMENT"),
    ]);
    expect(result.spending).toEqual(gbp("600"));
    expect(result.income).toEqual(gbp("0"));
    expect(result.unreviewedCount).toBe(5);
    expect(result.unclassifiedCount).toBe(2);
    expect(result.unknownDebtCount).toBe(1);
    expect(result.consumptionComplete).toBe(false);
  });
  it("separates known loan principal and interest and exactly reconciles every direction", () => {
    const rows = [
      component("100000", "INCOME"),
      component("-10000", "EXPENSE"),
      component("2000", "REFUND"),
      component("-30000", "PRINCIPAL"),
      component("400", "PRINCIPAL"),
      component("-5000", "DEBT_PAYMENT"),
      component("500", "DEBT_PAYMENT"),
      component("-7000", "CONTRIBUTION"),
      component("3000", "CONTRIBUTION"),
      component("-1000", "UNCLASSIFIED"),
      component("100", "UNCLASSIFIED"),
      component("-2000", "TRANSFER"),
      component("2000", "TRANSFER"),
    ];
    const result = summariseSpending(rows);
    expect(result.netCash).toEqual(gbp("53000"));
    expect(result.principalOut).toEqual(gbp("30000"));
    expect(result.principalIn).toEqual(gbp("400"));
    const bridge =
      BigInt(result.income.amountMinor) -
      BigInt(result.spending.amountMinor) +
      BigInt(result.transferIn.amountMinor) -
      BigInt(result.transferOut.amountMinor) +
      BigInt(result.debtSettlementIn.amountMinor) -
      BigInt(result.debtServiceOut.amountMinor) +
      BigInt(result.principalIn.amountMinor) -
      BigInt(result.principalOut.amountMinor) +
      BigInt(result.contributionIn.amountMinor) -
      BigInt(result.contributionOut.amountMinor) +
      BigInt(result.unclassifiedIn.amountMinor) -
      BigInt(result.unclassifiedOut.amountMinor);
    expect(bridge.toString()).toBe(result.netCash.amountMinor);
  });
  it("ignores pending, superseded, unpublished and zero rows", () => {
    const result = summariseSpending([
      component("-4000", "EXPENSE", { status: "PENDING" }),
      component("-4000", "EXPENSE", { status: "SUPERSEDED" }),
      component("-4000", "EXPENSE", { published: false }),
      component("0", null),
      component("-4200", "EXPENSE"),
    ]);
    expect(result.spending).toEqual(gbp("4200"));
    expect(result.unreviewedCount).toBe(0);
    expect(result.consumptionComplete).toBe(true);
  });
  it("preserves grouped SQL totals and source counts beyond signed 64-bit", () => {
    const result = summariseSpending([
      component("-18446744073709551614", "EXPENSE", {
        count: 2,
        category: "Large",
        aggregated: true,
      }),
    ]);
    expect(result.spending).toEqual(gbp("18446744073709551614"));
    expect(result.categories[0]?.count).toBe(2);
    expect(formatAggregateMoney(result.spending)).toBe(
      "£184,467,440,737,095,516.14",
    );
    expect(
      chartRatio("18446744073709551614", "36893488147419103228", 1000),
    ).toBe(500);
  });
  it("rejects invalid group signs and noncanonical or oversized amounts", () => {
    for (const row of [
      component("10", "EXPENSE"),
      component("-10", "REFUND"),
      component("-10", "INCOME"),
      component("01", null),
      component("-0", null),
      component("1".repeat(41), null),
      component("-10", "EXPENSE", { count: 0 }),
    ])
      expect(() => summariseSpending([row])).toThrow();
  });
});

describe("split validation", () => {
  it("replaces a parent's value with exact typed components, including mixed directions", () => {
    const lines = [
      {
        money: gbp("-12000"),
        classificationKind: "EXPENSE" as const,
        category: "Food",
      },
      {
        money: gbp("2000"),
        classificationKind: "REFUND" as const,
        category: "Food",
      },
    ];
    expect(() => validateSplits(gbp("-10000"), lines)).not.toThrow();
    expect(
      summariseSpending(
        lines.map((line) =>
          component(line.money.amountMinor, line.classificationKind, {
            category: line.category,
          }),
        ),
      ).spending,
    ).toEqual(gbp("10000"));
    expect(() => validateSplits(gbp("-10000"), [])).not.toThrow();
  });
  it("rejects nonreconciling, zero, oversized, too few and too many components", () => {
    const line = {
      money: gbp("-1"),
      classificationKind: "EXPENSE" as const,
      category: null,
    };
    for (const lines of [
      [line],
      [line, line],
      Array.from({ length: 21 }, () => line),
      [line, { ...line, money: gbp("0") }],
      [line, { ...line, money: gbp("-9223372036854775809") }],
      [
        line,
        { ...line, money: gbp("-9999"), classificationKind: "REFUND" as const },
      ],
    ])
      expect(() => validateSplits(gbp("-10000"), lines)).toThrow();
  });
});

describe("London calendar coverage", () => {
  it("uses explicit leap-aware dates without timezone or Date year coercion", () => {
    expect(monthBounds("2024-02")).toEqual({
      start: "2024-02-01",
      endExclusive: "2024-03-01",
    });
    expect(monthBounds("0001-12")).toEqual({
      start: "0001-12-01",
      endExclusive: "0002-01-01",
    });
    expect(previousMonths("2026-02", 3)).toEqual([
      "2025-12",
      "2026-01",
      "2026-02",
    ]);
    for (const value of ["0000-01", "9999-01", "2026-1", "2026-13"])
      expect(() => monthBounds(value)).toThrow();
  });
  it("requires completed periods, history attestations and reviewed known consumption for comparisons", () => {
    const complete = assessCoverage({
      month: "2026-09",
      today: "2026-10-23",
      accountCount: 2,
      attestedAccountCount: 2,
      unreviewedCount: 0,
      unclassifiedCount: 0,
      unknownDebtCount: 0,
    });
    expect(complete).toEqual({ complete: true, reasons: [] });
    expect(canComparePeriods(complete, complete)).toBe(true);
    for (const override of [
      { month: "2026-10" },
      { month: "2026-11" },
      { accountCount: 0, attestedAccountCount: 0 },
      { attestedAccountCount: 1 },
      { unreviewedCount: 1 },
      { unclassifiedCount: 1 },
      { unknownDebtCount: 1 },
    ]) {
      const partial = assessCoverage({
        month: "2026-09",
        today: "2026-10-23",
        accountCount: 2,
        attestedAccountCount: 2,
        unreviewedCount: 0,
        unclassifiedCount: 0,
        unknownDebtCount: 0,
        ...override,
      });
      expect(partial.complete).toBe(false);
      expect(partial.reasons.length).toBeGreaterThan(0);
      expect(canComparePeriods(complete, partial)).toBe(false);
    }
  });
});

it("preserves explicit classifications over provisional account defaults", () => {
  expect(effectiveClassification("CURRENT", "-500", "TRANSFER")).toEqual({
    kind: "TRANSFER",
    provisional: false,
  });
  expect(effectiveClassification("INVESTMENT", "500", null)).toEqual({
    kind: "UNCLASSIFIED",
    provisional: true,
  });
  expect(effectiveClassification("LOAN", "-500", null)).toEqual({
    kind: "UNCLASSIFIED",
    provisional: true,
  });
  const unknown = summariseSpending([
    component("-500", null, { accountKind: "LOAN" }),
  ]);
  expect(unknown.unknownDebtCount).toBe(1);
  expect(unknown.spending).toEqual(gbp("0"));
  expect(() => validateClassificationKind("-1", "INCOME")).toThrow();
});
it("keeps a named Other category distinct from an explicit grouped remainder", () => {
  const result = summariseSpending([
    component("-20", "EXPENSE", {
      category: "Other",
      aggregated: true,
      count: 2,
    }),
    component("-30", "EXPENSE", {
      category: "Other",
      aggregated: true,
      grouped: true,
      count: 3,
    }),
    component("10", "REFUND", { category: null }),
  ]);
  expect(result.categories).toEqual([
    { category: "Other", grouped: true, spending: gbp("30"), count: 3 },
    { category: "Other", grouped: false, spending: gbp("20"), count: 2 },
    { category: null, grouped: false, spending: gbp("-10"), count: 1 },
  ]);
  expect(result.spending).toEqual(gbp("40"));
});
it("keeps source int64 boundaries and fails safely when aggregate output exceeds 40 digits", () => {
  expect(() =>
    summariseSpending([component("-18446744073709551614", "EXPENSE")]),
  ).toThrow();
  expect(() =>
    summariseSpending([
      component("-" + "9".repeat(40), "EXPENSE", { aggregated: true }),
      component("-1", "EXPENSE"),
    ]),
  ).toThrow();
  expect(chartRatio("-1", "100")).toBe(0);
  expect(chartRatio("1", "0")).toBe(0);
  expect(chartRatio("101", "100")).toBe(1000);
  expect(() => chartRatio("1", "100", 1000001)).toThrow();
  expect(formatAggregateMoney(gbp("-1"))).toBe("-£0.01");
});
it("validates coverage dates and rejects inconsistent count inputs", () => {
  const input = {
    month: "2026-09",
    today: "2026-10-01",
    accountCount: 1,
    attestedAccountCount: 1,
    unreviewedCount: 0,
    unclassifiedCount: 0,
    unknownDebtCount: 0,
  };
  expect(assessCoverage(input).complete).toBe(true);
  for (const today of ["0000-01-01", "2026-02-30", "2026-13-01", "garbage"])
    expect(() => assessCoverage({ ...input, today })).toThrow();
  expect(() => assessCoverage({ ...input, attestedAccountCount: 2 })).toThrow();
  expect(() => previousMonths("0001-01", 2)).toThrow();
});
it("rejects zero typed expenses, income and refunds and nonempty zero-parent splits", () => {
  for (const kind of ["EXPENSE", "INCOME", "REFUND"] as const)
    expect(() => validateClassificationKind("0", kind)).toThrow();
  expect(() =>
    validateSplits(gbp("0"), [
      { money: gbp("-100"), classificationKind: "EXPENSE", category: null },
      { money: gbp("100"), classificationKind: "REFUND", category: null },
    ]),
  ).toThrow();
});
