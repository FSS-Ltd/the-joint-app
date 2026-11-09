import { describe, expect, it } from "vitest";
import {
  detectRecurringCosts,
  combineProposedReductions,
  type RecurringTransactionInput,
} from "../packages/domain/src/spending/recurring-costs.js";
import {
  calculateBaselines,
  type MonthBaselineInput,
} from "../packages/domain/src/spending/baselines.js";
import {
  resolveCategoryPrecedence,
  type CategorisationPrecedenceInput,
} from "../packages/domain/src/spending/precedence.js";

describe("categorisation precedence", () => {
  it("prioritises explicit manual override over matching rule and provider", () => {
    const input: CategorisationPrecedenceInput = {
      overrideCategory: "Groceries",
      rules: [
        {
          id: "rule-1",
          priority: 10,
          enabled: true,
          merchantPattern: "Tesco",
          category: "Supermarket",
        },
      ],
      providerCategory: "Food & Drink",
      description: "Tesco Stores 1234",
      merchant: "Tesco",
    };
    const result = resolveCategoryPrecedence(input);
    expect(result).toEqual({
      category: "Groceries",
      source: "MANUAL_OVERRIDE",
    });
  });

  it("respects explicit null override (uncategorized)", () => {
    const input: CategorisationPrecedenceInput = {
      overrideCategory: null,
      hasExplicitOverride: true,
      rules: [
        {
          id: "rule-1",
          priority: 10,
          enabled: true,
          merchantPattern: "Tesco",
          category: "Supermarket",
        },
      ],
      providerCategory: "Food & Drink",
      description: "Tesco Stores 1234",
      merchant: "Tesco",
    };
    const result = resolveCategoryPrecedence(input);
    expect(result).toEqual({
      category: null,
      source: "MANUAL_OVERRIDE",
    });
  });

  it("applies highest-priority enabled owner rule when no manual override", () => {
    const input: CategorisationPrecedenceInput = {
      rules: [
        {
          id: "rule-low",
          priority: 200,
          enabled: true,
          merchantPattern: "netflix",
          category: "Media",
        },
        {
          id: "rule-disabled",
          priority: 10,
          enabled: false,
          merchantPattern: "netflix",
          category: "Subscriptions",
        },
        {
          id: "rule-high",
          priority: 50,
          enabled: true,
          merchantPattern: "netflix",
          category: "Entertainment",
        },
      ],
      providerCategory: "Streaming",
      description: "NETFLIX.COM PAYMENT",
      merchant: "Netflix",
    };
    const result = resolveCategoryPrecedence(input);
    expect(result).toEqual({
      category: "Entertainment",
      source: "OWNER_RULE",
      ruleId: "rule-high",
    });
  });

  it("falls back to provider category when no rule matches", () => {
    const input: CategorisationPrecedenceInput = {
      rules: [],
      providerCategory: "Utilities",
      description: "British Gas",
      merchant: "British Gas",
    };
    const result = resolveCategoryPrecedence(input);
    expect(result).toEqual({
      category: "Utilities",
      source: "PROVIDER",
    });
  });

  it("returns null when no override, rule, or provider category exists", () => {
    const input: CategorisationPrecedenceInput = {
      rules: [],
      description: "Unknown Transfer",
    };
    const result = resolveCategoryPrecedence(input);
    expect(result).toEqual({
      category: null,
      source: "UNCATEGORIZED",
    });
  });
});

describe("pure recurring-cost detector", () => {
  const accountId = "00000000-0000-0000-0000-000000000001";

  it("detects genuine monthly subscription charge", () => {
    const transactions: RecurringTransactionInput[] = [
      {
        id: "tx-1",
        accountId,
        currency: "GBP",
        amountMinor: "-1599",
        bookedDate: "2026-06-15",
        description: "Netflix Subscription",
        merchant: "Netflix",
        classificationKind: "EXPENSE",
      },
      {
        id: "tx-2",
        accountId,
        currency: "GBP",
        amountMinor: "-1599",
        bookedDate: "2026-07-15",
        description: "Netflix Subscription",
        merchant: "Netflix",
        classificationKind: "EXPENSE",
      },
      {
        id: "tx-3",
        accountId,
        currency: "GBP",
        amountMinor: "-1599",
        bookedDate: "2026-08-15",
        description: "Netflix Subscription",
        merchant: "Netflix",
        classificationKind: "EXPENSE",
      },
      {
        id: "tx-4",
        accountId,
        currency: "GBP",
        amountMinor: "-1599",
        bookedDate: "2026-09-15",
        description: "Netflix Subscription",
        merchant: "Netflix",
        classificationKind: "EXPENSE",
      },
    ];

    const result = detectRecurringCosts(transactions, {
      referenceDate: "2026-10-01",
    });
    expect(result.candidates).toHaveLength(1);
    const candidate = result.candidates[0]!;
    expect(candidate.normalisedMerchant).toBe("netflix");
    expect(candidate.cadence).toBe("MONTHLY");
    expect(candidate.isVariable).toBe(false);
    expect(candidate.medianAmountMinor).toBe("1599");
    expect(candidate.meanAmountMinor).toBe("1599");
    expect(candidate.occurrenceCount).toBe(4);
    expect(candidate.confidence).toBe("HIGH");
    expect(candidate.status).toBe("CANDIDATE");
  });

  it("detects genuine weekly charge", () => {
    const transactions: RecurringTransactionInput[] = [
      {
        id: "tx-w1",
        accountId,
        currency: "GBP",
        amountMinor: "-2500",
        bookedDate: "2026-08-01",
        description: "Cleaner Weekly",
        merchant: "Sparkle Clean",
        classificationKind: "EXPENSE",
      },
      {
        id: "tx-w2",
        accountId,
        currency: "GBP",
        amountMinor: "-2500",
        bookedDate: "2026-08-08",
        description: "Cleaner Weekly",
        merchant: "Sparkle Clean",
        classificationKind: "EXPENSE",
      },
      {
        id: "tx-w3",
        accountId,
        currency: "GBP",
        amountMinor: "-2500",
        bookedDate: "2026-08-15",
        description: "Cleaner Weekly",
        merchant: "Sparkle Clean",
        classificationKind: "EXPENSE",
      },
      {
        id: "tx-w4",
        accountId,
        currency: "GBP",
        amountMinor: "-2500",
        bookedDate: "2026-08-22",
        description: "Cleaner Weekly",
        merchant: "Sparkle Clean",
        classificationKind: "EXPENSE",
      },
    ];

    const result = detectRecurringCosts(transactions, {
      referenceDate: "2026-09-01",
    });
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]!.cadence).toBe("WEEKLY");
    expect(result.candidates[0]!.medianAmountMinor).toBe("2500");
  });

  it("detects variable monthly utility bill and computes median estimate", () => {
    const transactions: RecurringTransactionInput[] = [
      {
        id: "tx-u1",
        accountId,
        currency: "GBP",
        amountMinor: "-6540",
        bookedDate: "2026-06-02",
        description: "Octopus Energy DD",
        merchant: "Octopus Energy",
        classificationKind: "EXPENSE",
      },
      {
        id: "tx-u2",
        accountId,
        currency: "GBP",
        amountMinor: "-7210",
        bookedDate: "2026-07-02",
        description: "Octopus Energy DD",
        merchant: "Octopus Energy",
        classificationKind: "EXPENSE",
      },
      {
        id: "tx-u3",
        accountId,
        currency: "GBP",
        amountMinor: "-5890",
        bookedDate: "2026-08-02",
        description: "Octopus Energy DD",
        merchant: "Octopus Energy",
        classificationKind: "EXPENSE",
      },
    ];

    const result = detectRecurringCosts(transactions, {
      referenceDate: "2026-09-01",
    });
    expect(result.candidates).toHaveLength(1);
    const candidate = result.candidates[0]!;
    expect(candidate.cadence).toBe("MONTHLY");
    expect(candidate.isVariable).toBe(true);
    // Sorted amounts: 5890, 6540, 7210 -> median is 6540
    expect(candidate.medianAmountMinor).toBe("6540");
    // Mean: (5890 + 6540 + 7210) / 3 = 6546.666 -> 6547 (HALF_UP)
    expect(candidate.meanAmountMinor).toBe("6547");
    expect(candidate.confidence).toBe("MEDIUM");
  });

  it("rejects irregular cafe pattern as not recurring", () => {
    // Visits cafe irregularly: day 1, day 4, day 17, day 42
    // Gaps: 3, 13, 25 -> median gap = 13 (not 6-8 and not 25-35)
    const transactions: RecurringTransactionInput[] = [
      {
        id: "tx-c1",
        accountId,
        currency: "GBP",
        amountMinor: "-380",
        bookedDate: "2026-06-01",
        description: "Costa Coffee London",
        merchant: "Costa Coffee",
        classificationKind: "EXPENSE",
      },
      {
        id: "tx-c2",
        accountId,
        currency: "GBP",
        amountMinor: "-420",
        bookedDate: "2026-06-04",
        description: "Costa Coffee Kings X",
        merchant: "Costa Coffee",
        classificationKind: "EXPENSE",
      },
      {
        id: "tx-c3",
        accountId,
        currency: "GBP",
        amountMinor: "-380",
        bookedDate: "2026-06-17",
        description: "Costa Coffee Oxford St",
        merchant: "Costa Coffee",
        classificationKind: "EXPENSE",
      },
      {
        id: "tx-c4",
        accountId,
        currency: "GBP",
        amountMinor: "-390",
        bookedDate: "2026-07-12",
        description: "Costa Coffee London",
        merchant: "Costa Coffee",
        classificationKind: "EXPENSE",
      },
    ];

    const result = detectRecurringCosts(transactions, {
      referenceDate: "2026-08-01",
    });
    expect(result.candidates).toHaveLength(0);
  });

  it("excludes transfers, refunds, income and non-consumption", () => {
    const transactions: RecurringTransactionInput[] = [
      {
        id: "tx-t1",
        accountId,
        currency: "GBP",
        amountMinor: "-10000",
        bookedDate: "2026-06-01",
        description: "Transfer to Savings",
        merchant: "Savings Transfer",
        classificationKind: "TRANSFER",
      },
      {
        id: "tx-t2",
        accountId,
        currency: "GBP",
        amountMinor: "-10000",
        bookedDate: "2026-07-01",
        description: "Transfer to Savings",
        merchant: "Savings Transfer",
        classificationKind: "TRANSFER",
      },
      {
        id: "tx-t3",
        accountId,
        currency: "GBP",
        amountMinor: "-10000",
        bookedDate: "2026-08-01",
        description: "Transfer to Savings",
        merchant: "Savings Transfer",
        classificationKind: "TRANSFER",
      },
      {
        id: "tx-r1",
        accountId,
        currency: "GBP",
        amountMinor: "2000",
        bookedDate: "2026-06-10",
        description: "Refund Merchant",
        merchant: "Refund Merchant",
        classificationKind: "REFUND",
      },
      {
        id: "tx-r2",
        accountId,
        currency: "GBP",
        amountMinor: "2000",
        bookedDate: "2026-07-10",
        description: "Refund Merchant",
        merchant: "Refund Merchant",
        classificationKind: "REFUND",
      },
      {
        id: "tx-r3",
        accountId,
        currency: "GBP",
        amountMinor: "2000",
        bookedDate: "2026-08-10",
        description: "Refund Merchant",
        merchant: "Refund Merchant",
        classificationKind: "REFUND",
      },
    ];

    const result = detectRecurringCosts(transactions, {
      referenceDate: "2026-09-01",
    });
    expect(result.candidates).toHaveLength(0);
  });

  it("excludes transactions flagged as one-off", () => {
    const transactions: RecurringTransactionInput[] = [
      {
        id: "tx-o1",
        accountId,
        currency: "GBP",
        amountMinor: "-5000",
        bookedDate: "2026-06-01",
        description: "Dentist Crown",
        merchant: "Dentist",
        classificationKind: "EXPENSE",
        isOneOff: true,
      },
      {
        id: "tx-o2",
        accountId,
        currency: "GBP",
        amountMinor: "-5000",
        bookedDate: "2026-07-01",
        description: "Dentist Followup",
        merchant: "Dentist",
        classificationKind: "EXPENSE",
        isOneOff: true,
      },
      {
        id: "tx-o3",
        accountId,
        currency: "GBP",
        amountMinor: "-5000",
        bookedDate: "2026-08-01",
        description: "Dentist Checkup",
        merchant: "Dentist",
        classificationKind: "EXPENSE",
        isOneOff: true,
      },
    ];

    const result = detectRecurringCosts(transactions, {
      referenceDate: "2026-09-01",
    });
    expect(result.candidates).toHaveLength(0);
  });

  it("ignores transactions outside 180-day window", () => {
    const transactions: RecurringTransactionInput[] = [
      {
        id: "tx-old",
        accountId,
        currency: "GBP",
        amountMinor: "-1000",
        bookedDate: "2025-12-01", // ~300 days old
        description: "Gym Membership",
        merchant: "Gym",
        classificationKind: "EXPENSE",
      },
      {
        id: "tx-1",
        accountId,
        currency: "GBP",
        amountMinor: "-1000",
        bookedDate: "2026-08-01",
        description: "Gym Membership",
        merchant: "Gym",
        classificationKind: "EXPENSE",
      },
      {
        id: "tx-2",
        accountId,
        currency: "GBP",
        amountMinor: "-1000",
        bookedDate: "2026-09-01",
        description: "Gym Membership",
        merchant: "Gym",
        classificationKind: "EXPENSE",
      },
    ];

    // Only 2 occurrences within 180 days -> less than required 3 -> rejected
    const result = detectRecurringCosts(transactions, {
      referenceDate: "2026-10-01",
    });
    expect(result.candidates).toHaveLength(0);
  });

  it("combines overlapping proposed reductions without double-counting", () => {
    const reductions = [
      {
        id: "r1",
        merchant: "netflix",
        category: "Entertainment",
        proposedSavingMinor: "1599",
      },
      {
        id: "r2",
        merchant: "netflix",
        category: "Entertainment",
        proposedSavingMinor: "1599", // duplicate
      },
      {
        id: "r3",
        merchant: "spotify",
        category: "Entertainment",
        proposedSavingMinor: "1099",
      },
    ];
    const combined = combineProposedReductions(reductions);
    expect(combined.totalSavingMinor).toBe("2698"); // 1599 + 1099
    expect(combined.items).toHaveLength(2);
  });
});

describe("complete-month baselines", () => {
  it("computes 3, 6, and 12 complete-month baselines with stable pay", () => {
    const months: MonthBaselineInput[] = [
      {
        month: "2025-10",
        spendingMinor: "220000",
        incomeMinor: "350000",
        complete: true,
      },
      {
        month: "2025-11",
        spendingMinor: "240000",
        incomeMinor: "350000",
        complete: true,
      },
      {
        month: "2025-12",
        spendingMinor: "280000",
        incomeMinor: "350000",
        complete: true,
      },
      {
        month: "2026-01",
        spendingMinor: "210000",
        incomeMinor: "350000",
        complete: true,
      },
      {
        month: "2026-02",
        spendingMinor: "230000",
        incomeMinor: "350000",
        complete: true,
      },
      {
        month: "2026-03",
        spendingMinor: "225000",
        incomeMinor: "350000",
        complete: true,
      },
      {
        month: "2026-04",
        spendingMinor: "215000",
        incomeMinor: "350000",
        complete: true,
      },
      {
        month: "2026-05",
        spendingMinor: "235000",
        incomeMinor: "350000",
        complete: true,
      },
      {
        month: "2026-06",
        spendingMinor: "220000",
        incomeMinor: "350000",
        complete: true,
      },
      {
        month: "2026-07",
        spendingMinor: "240000",
        incomeMinor: "350000",
        complete: true,
      },
      {
        month: "2026-08",
        spendingMinor: "250000",
        incomeMinor: "350000",
        complete: true,
      },
      {
        month: "2026-09",
        spendingMinor: "260000",
        incomeMinor: "350000",
        complete: true,
      },
    ];

    const result = calculateBaselines({
      months,
      currentMonth: "2026-10",
      scopeAccountIds: ["acc-1"],
    });

    expect(result.insufficientHistory).toBe(false);
    expect(result.requiresIncomeConfirmation).toBe(false);
    expect(result.proposedBaselineSpendingMinor).toBe("250000"); // 3-month mean (Jul: 240k, Aug: 250k, Sep: 260k)
    expect(result.proposedBaselineIncomeMinor).toBe("350000");

    const w3 = result.windows.find((w) => w.windowMonths === 3);
    expect(w3).toBeDefined();
    expect(w3!.complete).toBe(true);
    expect(w3!.months).toEqual(["2026-07", "2026-08", "2026-09"]);
    expect(w3!.meanSpendingMinor).toBe("250000");
    expect(w3!.medianSpendingMinor).toBe("250000");

    const w12 = result.windows.find((w) => w.windowMonths === 12);
    expect(w12).toBeDefined();
    expect(w12!.complete).toBe(true);
    expect(w12!.percentile25IncomeMinor).toBe("350000");
  });

  it("handles genuine zero-income complete month", () => {
    const months: MonthBaselineInput[] = [
      {
        month: "2026-07",
        spendingMinor: "200000",
        incomeMinor: "300000",
        complete: true,
      },
      {
        month: "2026-08",
        spendingMinor: "200000",
        incomeMinor: "0", // Genuine 0 income month!
        complete: true,
      },
      {
        month: "2026-09",
        spendingMinor: "200000",
        incomeMinor: "300000",
        complete: true,
      },
    ];

    const result = calculateBaselines({
      months,
      currentMonth: "2026-10",
      scopeAccountIds: ["acc-1"],
    });

    expect(result.insufficientHistory).toBe(false);
    const w3 = result.windows.find((w) => w.windowMonths === 3);
    expect(w3!.complete).toBe(true);
    // Incomes: 0, 300000, 300000 -> median is 300000, mean is 200000
    expect(w3!.medianIncomeMinor).toBe("300000");
    expect(w3!.meanIncomeMinor).toBe("200000");
    expect(w3!.isVariableIncome).toBe(true);
    expect(result.requiresIncomeConfirmation).toBe(true);
  });

  it("marks window incomplete when any month has incomplete coverage", () => {
    const months: MonthBaselineInput[] = [
      {
        month: "2026-07",
        spendingMinor: "200000",
        incomeMinor: "300000",
        complete: true,
      },
      {
        month: "2026-08",
        spendingMinor: "0", // Missing connection coverage, not a zero-spend month!
        incomeMinor: "0",
        complete: false,
      },
      {
        month: "2026-09",
        spendingMinor: "200000",
        incomeMinor: "300000",
        complete: true,
      },
    ];

    const result = calculateBaselines({
      months,
      currentMonth: "2026-10",
      scopeAccountIds: ["acc-1"],
    });

    // 3-month window includes incomplete month 2026-08 -> cannot form complete baseline
    expect(result.insufficientHistory).toBe(true);
    const w3 = result.windows.find((w) => w.windowMonths === 3);
    expect(w3!.complete).toBe(false);
    expect(w3!.insufficientHistory).toBe(true);
  });

  it("calculates conservative 25th percentile for 12 complete months using nearest-rank", () => {
    // 12 months with varying incomes:
    // [1000, 1200, 1400, 1600, 1800, 2000, 2200, 2400, 2600, 2800, 3000, 3200]
    // nearest rank: ceil(0.25 * 12) = ceil(3) = 3 -> 3rd element = 1400
    const months: MonthBaselineInput[] = [
      "2025-10",
      "2025-11",
      "2025-12",
      "2026-01",
      "2026-02",
      "2026-03",
      "2026-04",
      "2026-05",
      "2026-06",
      "2026-07",
      "2026-08",
      "2026-09",
    ].map((month, idx) => ({
      month,
      spendingMinor: "150000",
      incomeMinor: ((idx + 5) * 10000).toString(), // 50k, 60k, 70k, ...
      complete: true,
    }));

    const result = calculateBaselines({
      months,
      currentMonth: "2026-10",
      scopeAccountIds: ["acc-1"],
    });

    const w12 = result.windows.find((w) => w.windowMonths === 12)!;
    expect(w12.complete).toBe(true);
    // Sorted: 50k, 60k, 70k, 80k, 90k, 100k, 110k, 120k, 130k, 140k, 150k, 160k
    // rank = ceil(0.25 * 12) = 3 -> index 2 -> 70000
    expect(w12.percentile25IncomeMinor).toBe("70000");
  });

  it("returns insufficientHistory when fewer than 3 complete months exist", () => {
    const months: MonthBaselineInput[] = [
      {
        month: "2026-08",
        spendingMinor: "200000",
        incomeMinor: "300000",
        complete: true,
      },
      {
        month: "2026-09",
        spendingMinor: "220000",
        incomeMinor: "300000",
        complete: true,
      },
    ];

    const result = calculateBaselines({
      months,
      currentMonth: "2026-10",
      scopeAccountIds: ["acc-1"],
    });

    expect(result.insufficientHistory).toBe(true);
    expect(result.proposedBaselineSpendingMinor).toBeNull();
    expect(result.proposedBaselineIncomeMinor).toBeNull();
  });
});
