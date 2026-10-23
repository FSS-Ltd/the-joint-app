import { describe, expect, it } from "vitest";
import {
  contributionPlanDtoSchema,
  goalAllocationSetDtoSchema,
  goalDtoSchema,
  projectionInputV1Schema,
  projectionResultV1Schema,
  projectionRunDtoSchema,
  scenarioDtoSchema,
  wealthSummaryDtoSchema,
} from "../packages/contracts/src/index.js";

const id = "11111111-1111-4111-8111-111111111111";
const id2 = "22222222-2222-4222-8222-222222222222";
const id3 = "33333333-3333-4333-8333-333333333333";
const money = (amountMinor: string) => ({ amountMinor, currency: "GBP" });
const userRate = {
  sourceKind: "USER",
  sourceRef: null,
  effectiveDate: "2026-10-23",
  convention: "EFFECTIVE_ANNUAL",
};
const source = {
  accountId: id,
  valuationId: id2,
  asOfDate: "2026-10-23",
  source: "MANUAL",
};
const baseInput = {
  schema: "projection-input",
  schemaVersion: 1,
  mode: "BASIC",
  opening: money("100000"),
  target: money("400000"),
  targetBasis: "FIXED_NOMINAL",
  firstContributionDate: "2026-11-30",
  horizonMonths: 12,
  monthlyContributions: [{ fromMonth: 1, amount: money("25000") }],
};
const baseResult = {
  schema: "projection-result",
  schemaVersion: 1,
  status: "reachable",
  firstQualifyingDate: "2027-10-31",
  series: (
    [
      ["2026-11-30", "125000"],
      ["2026-12-31", "150000"],
      ["2027-01-31", "175000"],
      ["2027-02-28", "200000"],
      ["2027-03-31", "225000"],
      ["2027-04-30", "250000"],
      ["2027-05-31", "275000"],
      ["2027-06-30", "300000"],
      ["2027-07-31", "325000"],
      ["2027-08-31", "350000"],
      ["2027-09-30", "375000"],
      ["2027-10-31", "400000"],
    ] as const
  ).map(([date, closing], index) => ({
    month: index + 1,
    date,
    closing: money(closing),
    target: money("400000"),
  })),
  breakdown: {
    opening: money("100000"),
    contributions: money("300000"),
    withdrawals: money("0"),
    growth: money("0"),
    proportionalFees: money("0"),
    fixedFees: money("0"),
    tax: money("0"),
    closing: money("400000"),
  },
  warnings: [],
};

describe("Task 3A contract boundaries", () => {
  it("keeps visible manual wealth provenance without inaccessible account counts", () => {
    const summary = {
      schema: "wealth-summary",
      schemaVersion: 1,
      householdId: id,
      scope: {
        kind: "VISIBLE",
        accountIds: [id],
        datasetVersion: 1,
        grantVersion: 2,
      },
      completeness: "PARTIAL",
      excludedReasons: ["MISSING_VALUATION"],
      valuations: [source],
      asOfDate: "2026-10-23",
      adultNetWorth: money("100000"),
      liquidAdultAssets: money("100000"),
    };
    expect(wealthSummaryDtoSchema.safeParse(summary).success).toBe(true);
    expect(
      wealthSummaryDtoSchema.safeParse({
        ...summary,
        scope: { ...summary.scope, accountIds: [id, id] },
      }).success,
    ).toBe(false);
    expect(
      wealthSummaryDtoSchema.safeParse({
        ...summary,
        valuations: [source, source],
      }).success,
    ).toBe(false);
    expect(
      wealthSummaryDtoSchema.safeParse({
        ...summary,
        valuations: [source, { ...source, valuationId: id3 }],
      }).success,
    ).toBe(false);
    expect(
      wealthSummaryDtoSchema.safeParse({
        ...summary,
        valuations: [{ ...source, accountId: id3 }],
      }).success,
    ).toBe(false);
    expect(
      wealthSummaryDtoSchema.safeParse({
        ...summary,
        scope: { ...summary.scope, accountIds: [id, id3] },
        valuations: [source, { ...source, accountId: id3 }],
      }).success,
    ).toBe(false);
    expect(
      wealthSummaryDtoSchema.safeParse({
        ...summary,
        inaccessibleAccountCount: 1,
      }).success,
    ).toBe(false);
    expect(
      wealthSummaryDtoSchema.safeParse({
        ...summary,
        adultNetWorth: { amountMinor: "-0", currency: "GBP" },
      }).success,
    ).toBe(false);
    expect(
      wealthSummaryDtoSchema.safeParse({
        ...summary,
        adultNetWorth: { amountMinor: "1", currency: "USD" },
      }).success,
    ).toBe(false);
    expect(
      wealthSummaryDtoSchema.safeParse({
        ...summary,
        adultNetWorth: money("9223372036854775808"),
      }).success,
    ).toBe(true);
    expect(
      wealthSummaryDtoSchema.safeParse({ ...summary, asOfDate: "0000-01-01" })
        .success,
    ).toBe(false);
    expect(
      wealthSummaryDtoSchema.safeParse({ ...summary, asOfDate: "2026-02-30" })
        .success,
    ).toBe(false);
  });

  it("requires adult goals with a bounded version and canonical GBP target", () => {
    const goal = {
      schema: "goal",
      schemaVersion: 1,
      id,
      householdId: id2,
      name: "Home",
      status: "ACTIVE",
      beneficiary: "ADULT",
      priority: 1,
      version: 1,
      target: money("400000"),
      targetDate: null,
    };
    expect(goalDtoSchema.safeParse(goal).success).toBe(true);
    expect(
      goalDtoSchema.safeParse({ ...goal, beneficiary: "CHILD" }).success,
    ).toBe(false);
    expect(
      goalDtoSchema.safeParse({ ...goal, target: money("-1") }).success,
    ).toBe(false);
    expect(goalDtoSchema.safeParse({ ...goal, version: 0 }).success).toBe(
      false,
    );
  });

  it("distinguishes fixed money from a fraction of a named valuation", () => {
    const allocation = {
      schema: "goal-allocation-set",
      schemaVersion: 1,
      id,
      goalId: id2,
      householdId: id,
      version: 1,
      allocations: [
        {
          basis: "FRACTION",
          accountId: id,
          valuationId: id2,
          fraction: "0.25",
        },
      ],
    };
    expect(goalAllocationSetDtoSchema.safeParse(allocation).success).toBe(true);
    expect(
      goalAllocationSetDtoSchema.safeParse({
        ...allocation,
        allocations: [
          allocation.allocations[0],
          { ...allocation.allocations[0], valuationId: id3 },
        ],
      }).success,
    ).toBe(false);
    expect(
      goalAllocationSetDtoSchema.safeParse({
        ...allocation,
        allocations: [
          allocation.allocations[0],
          {
            basis: "FIXED",
            accountId: id,
            valuationId: id3,
            amount: money("100"),
          },
        ],
      }).success,
    ).toBe(false);
    expect(
      goalAllocationSetDtoSchema.safeParse({
        ...allocation,
        allocations: [
          allocation.allocations[0],
          { ...allocation.allocations[0], accountId: id3, valuationId: id3 },
        ],
      }).success,
    ).toBe(true);
    for (const fraction of ["0", "1.01", "-0", "0.250", "25%", "01", "1.0"])
      expect(
        goalAllocationSetDtoSchema.safeParse({
          ...allocation,
          allocations: [{ ...allocation.allocations[0], fraction }],
        }).success,
      ).toBe(false);
    expect(
      goalAllocationSetDtoSchema.safeParse({
        ...allocation,
        allocations: [
          {
            basis: "FIXED",
            accountId: id,
            valuationId: id2,
            amount: money("100"),
            fraction: "0.5",
          },
        ],
      }).success,
    ).toBe(false);
    expect(
      goalAllocationSetDtoSchema.safeParse({
        ...allocation,
        allocations: [
          {
            basis: "FIXED",
            accountId: id,
            valuationId: id2,
            amount: money("100"),
          },
        ],
      }).success,
    ).toBe(true);
  });

  it("keeps BASIC contribution-only and validates ADVANCED rate and horizon bounds", () => {
    expect(projectionInputV1Schema.safeParse(baseInput).success).toBe(true);
    expect(
      projectionInputV1Schema.safeParse({
        ...baseInput,
        grossAnnualRate: "0.05",
      }).success,
    ).toBe(false);
    expect(
      projectionInputV1Schema.safeParse({ ...baseInput, horizonMonths: 601 })
        .success,
    ).toBe(false);
    expect(
      projectionInputV1Schema.safeParse({
        ...baseInput,
        monthlyContributions: [{ fromMonth: 13, amount: money("1") }],
      }).success,
    ).toBe(false);
    expect(
      projectionInputV1Schema.safeParse({
        ...baseInput,
        opening: { amountMinor: "1", currency: "EUR" },
      }).success,
    ).toBe(false);
    expect(
      projectionInputV1Schema.safeParse({
        ...baseInput,
        firstContributionDate: "2026-11-29",
      }).success,
    ).toBe(false);
    expect(
      projectionInputV1Schema.safeParse({
        ...baseInput,
        firstContributionDate: "0004-02-29",
      }).success,
    ).toBe(true);
    expect(
      projectionInputV1Schema.safeParse({
        ...baseInput,
        firstContributionDate: "0001-02-29",
      }).success,
    ).toBe(false);
    expect(
      projectionInputV1Schema.safeParse({
        ...baseInput,
        firstContributionDate: "9999-12-31",
        horizonMonths: 2,
      }).success,
    ).toBe(false);
    expect(
      projectionInputV1Schema.safeParse({
        ...baseInput,
        firstContributionDate: "9950-01-31",
        horizonMonths: 600,
      }).success,
    ).toBe(true);
    const advanced = {
      ...baseInput,
      mode: "ADVANCED",
      scenarioId: id,
      withdrawals: [],
      fixedFees: [],
      tax: [],
      grossAnnualRate: "-0.05",
      proportionalFeeAnnualRate: "0.01",
      inflationAnnualRate: "0.02",
      rateProvenance: { growth: userRate, fee: userRate, inflation: userRate },
    };
    expect(projectionInputV1Schema.safeParse(advanced).success).toBe(true);
    for (const grossAnnualRate of ["-1.01", "-0", "0.050", "1e-2", "01", "1."])
      expect(
        projectionInputV1Schema.safeParse({ ...advanced, grossAnnualRate })
          .success,
      ).toBe(false);
    expect(
      projectionInputV1Schema.safeParse({
        ...advanced,
        proportionalFeeAnnualRate: "1",
      }).success,
    ).toBe(false);
    for (const grossAnnualRate of [
      "-1.000000000001",
      "1.000000000001",
      "0.1234567890123",
      "9".repeat(1000),
    ])
      expect(
        projectionInputV1Schema.safeParse({ ...advanced, grossAnnualRate })
          .success,
      ).toBe(false);
    for (const inflationAnnualRate of [
      "-1",
      "-1.000000000001",
      "1.000000000001",
      "0.1234567890123",
    ])
      expect(
        projectionInputV1Schema.safeParse({ ...advanced, inflationAnnualRate })
          .success,
      ).toBe(false);
    expect(
      projectionInputV1Schema.safeParse({
        ...advanced,
        grossAnnualRate: "1",
        inflationAnnualRate: "1",
      }).success,
    ).toBe(true);
    for (const proportionalFeeAnnualRate of [
      "1.000000000001",
      "0.9999999999999",
    ])
      expect(
        projectionInputV1Schema.safeParse({
          ...advanced,
          proportionalFeeAnnualRate,
        }).success,
      ).toBe(false);
    expect(
      projectionInputV1Schema.safeParse({
        ...advanced,
        rateProvenance: {
          ...advanced.rateProvenance,
          fee: {
            ...userRate,
            sourceKind: "VERIFIED_PROVIDER",
            sourceRef: null,
          },
        },
      }).success,
    ).toBe(false);
    expect(
      projectionInputV1Schema.safeParse({
        ...advanced,
        rateProvenance: {
          ...advanced.rateProvenance,
          fee: {
            ...userRate,
            sourceKind: "VERIFIED_PROVIDER",
            sourceRef: "approved-rate:123",
          },
        },
      }).success,
    ).toBe(true);
    expect(
      projectionInputV1Schema.safeParse({
        ...advanced,
        withdrawals: [{ month: 13, amount: money("1") }],
      }).success,
    ).toBe(false);
  });

  it("validates monthly contribution plans and immutable scenario/run evidence shapes", () => {
    const plan = {
      schema: "contribution-plan",
      schemaVersion: 1,
      id,
      householdId: id2,
      goalId: id,
      version: 1,
      firstContributionDate: "2026-11-30",
      monthlyContributions: [{ fromMonth: 1, amount: money("25000") }],
    };
    expect(contributionPlanDtoSchema.safeParse(plan).success).toBe(true);
    expect(
      contributionPlanDtoSchema.safeParse({
        ...plan,
        monthlyContributions: [{ fromMonth: 1, amount: money("-1") }],
      }).success,
    ).toBe(false);
    expect(
      contributionPlanDtoSchema.safeParse({
        ...plan,
        firstContributionDate: "9950-02-28",
      }).success,
    ).toBe(false);
    const scenario = {
      schema: "scenario",
      schemaVersion: 1,
      id,
      householdId: id2,
      goalId: id,
      version: 1,
      input: {
        ...baseInput,
        mode: "ADVANCED",
        scenarioId: id,
        withdrawals: [],
        fixedFees: [],
        tax: [],
        grossAnnualRate: "0",
        proportionalFeeAnnualRate: "0",
        inflationAnnualRate: "0",
        rateProvenance: {
          growth: userRate,
          fee: userRate,
          inflation: userRate,
        },
      },
      createdAt: "2026-10-23T12:00:00Z",
    };
    expect(scenarioDtoSchema.safeParse(scenario).success).toBe(true);
    expect(
      scenarioDtoSchema.safeParse({
        ...scenario,
        createdAt: "0000-10-23T12:00:00Z",
      }).success,
    ).toBe(false);
    const run = {
      schema: "projection-run",
      schemaVersion: 1,
      id,
      householdId: id2,
      goalId: id,
      scenarioId: null,
      mode: "BASIC",
      input: baseInput,
      result: baseResult,
      inputHash: "a".repeat(64),
      engineVersion: "1.0.0",
      roundingConvention: "HALF_UP_MINOR_UNIT",
      source: { datasetVersion: 1, grantVersion: 2, valuations: [source] },
      createdAt: "2026-10-23T12:00:00Z",
    };
    expect(projectionRunDtoSchema.safeParse(run).success).toBe(true);
    for (const field of ["closing", "target"] as const) {
      for (const amountMinor of ["invalid", "1.5", "1e3"]) {
        const malformedRun = {
          ...run,
          result: {
            ...baseResult,
            series: [
              { ...baseResult.series[0], [field]: money(amountMinor) },
              ...baseResult.series.slice(1),
            ],
          },
        };
        const parse = () => projectionRunDtoSchema.safeParse(malformedRun);
        expect(parse).not.toThrow();
        expect(parse().success).toBe(false);
      }
    }
    for (const malformedRun of [
      { ...run, input: { ...baseInput, firstContributionDate: "invalid" } },
      {
        ...run,
        result: {
          ...baseResult,
          series: [
            { ...baseResult.series[0], month: "invalid" },
            ...baseResult.series.slice(1),
          ],
        },
      },
    ]) {
      const parse = () => projectionRunDtoSchema.safeParse(malformedRun);
      expect(parse).not.toThrow();
      expect(parse().success).toBe(false);
    }
    expect(
      projectionRunDtoSchema.safeParse({
        ...run,
        input: { ...baseInput, horizonMonths: 11 },
      }).success,
    ).toBe(false);
    expect(
      projectionRunDtoSchema.safeParse({
        ...run,
        result: {
          ...baseResult,
          series: [...baseResult.series, baseResult.series[11]],
        },
      }).success,
    ).toBe(false);
    expect(
      projectionRunDtoSchema.safeParse({
        ...run,
        result: {
          ...baseResult,
          series: [baseResult.series[1], baseResult.series[0]],
        },
      }).success,
    ).toBe(false);
    expect(
      projectionRunDtoSchema.safeParse({
        ...run,
        result: {
          ...baseResult,
          series: [
            ...baseResult.series.slice(0, 11),
            { ...baseResult.series[11], month: 13 },
          ],
        },
      }).success,
    ).toBe(false);
    expect(
      projectionRunDtoSchema.safeParse({
        ...run,
        result: {
          ...baseResult,
          series: [
            ...baseResult.series.slice(0, 11),
            { ...baseResult.series[11], date: "2027-11-30" },
          ],
        },
      }).success,
    ).toBe(false);
    expect(
      projectionRunDtoSchema.safeParse({
        ...run,
        result: { ...baseResult, firstQualifyingDate: "2027-09-30" },
      }).success,
    ).toBe(false);
    expect(
      projectionRunDtoSchema.safeParse({
        ...run,
        result: {
          ...baseResult,
          series: [
            ...baseResult.series.slice(0, 11),
            { ...baseResult.series[11], closing: money("399999") },
          ],
        },
      }).success,
    ).toBe(false);
    expect(
      projectionRunDtoSchema.safeParse({
        ...run,
        result: {
          ...baseResult,
          status: "already_achieved",
          firstQualifyingDate: null,
        },
      }).success,
    ).toBe(true);
    expect(
      projectionRunDtoSchema.safeParse({ ...run, scenarioId: id }).success,
    ).toBe(false);
    expect(
      projectionRunDtoSchema.safeParse({
        ...run,
        source: { ...run.source, valuations: [{ ...source, source: "FEED" }] },
      }).success,
    ).toBe(false);
  });

  it.each([
    "already_achieved",
    "reachable",
    "insufficient_inputs",
    "budget_deficit",
    "depleted",
    "unreachable_under_assumptions",
    "beyond_horizon",
  ] as const)(
    "accepts calculation state %s without treating access denial as one",
    (status) => {
      expect(
        projectionResultV1Schema.safeParse({ ...baseResult, status }).success,
      ).toBe(true);
    },
  );
  it("rejects access denial and unknown result fields", () => {
    expect(
      projectionResultV1Schema.safeParse({
        ...baseResult,
        status: "ACCESS_DENIED",
      }).success,
    ).toBe(false);
    expect(
      projectionResultV1Schema.safeParse({ ...baseResult, hidden: true })
        .success,
    ).toBe(false);
    expect(
      projectionResultV1Schema.safeParse({
        ...baseResult,
        firstQualifyingDate: "2027-10-30",
      }).success,
    ).toBe(false);
  });
});
