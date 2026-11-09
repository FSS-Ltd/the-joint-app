import { describe, expect, it } from "vitest";
import type { ProjectionInputV1 } from "../packages/projections/src/index.js";
import {
  calculateProjection,
  canonicalJson,
  hashProjectionInput,
  monthlyCompoundingFactor,
  monthlyFeeRetentionFactor,
  roundHalfUp,
  SCALE,
} from "../packages/projections/src/index.js";

const money = (amountMinor: string) => ({
  amountMinor,
  currency: "GBP" as const,
});
const scenarioId = "00000000-0000-4000-8000-000000000001";

type RateProvenance = Extract<
  ProjectionInputV1,
  { mode: "ADVANCED" }
>["rateProvenance"]["growth"];

const userRate: RateProvenance = {
  sourceKind: "USER",
  sourceRef: null,
  effectiveDate: "2026-11-01",
  convention: "EFFECTIVE_ANNUAL",
};

const illustrationRate: RateProvenance = {
  sourceKind: "ILLUSTRATION",
  sourceRef: null,
  effectiveDate: "2026-11-01",
  convention: "EFFECTIVE_ANNUAL",
};

describe("IOS8: Deterministic projection engine", () => {
  describe("Mathematical primitives and HALF_UP rounding", () => {
    it("rounds exact half away from zero on positive and negative numbers", () => {
      // 5 / 2 = 2.5 -> 3
      expect(roundHalfUp(5n, 2n)).toBe(3n);
      // -5 / 2 = -2.5 -> -3
      expect(roundHalfUp(-5n, 2n)).toBe(-3n);
      // 4 / 2 = 2 -> 2
      expect(roundHalfUp(4n, 2n)).toBe(2n);
      // -4 / 2 = -2 -> -2
      expect(roundHalfUp(-4n, 2n)).toBe(-2n);
      // 1 / 4 = 0.25 -> 0
      expect(roundHalfUp(1n, 4n)).toBe(0n);
      // 3 / 4 = 0.75 -> 1
      expect(roundHalfUp(3n, 4n)).toBe(1n);
    });

    it("rejects non-positive denominator", () => {
      expect(() => roundHalfUp(1n, 0n)).toThrow(/positive/i);
      expect(() => roundHalfUp(1n, -2n)).toThrow(/positive/i);
    });

    it("computes monthly compounding and fee factors deterministically", () => {
      expect(monthlyCompoundingFactor("0")).toBe(SCALE);
      expect(monthlyCompoundingFactor("-1")).toBe(0n);
      expect(monthlyFeeRetentionFactor("0")).toBe(SCALE);

      const factor5Pct = monthlyCompoundingFactor("0.05");
      // (1.05)^(1/12) ≈ 1.0040741237836483
      expect(factor5Pct).toBeGreaterThan(SCALE);

      const fee1Pct = monthlyFeeRetentionFactor("0.01");
      // (0.99)^(1/12) ≈ 0.9991624647
      expect(fee1Pct).toBeLessThan(SCALE);
    });
  });

  describe("Canonical JSON and input hashing", () => {
    it("produces identical SHA-256 hash regardless of object key order", () => {
      const inputA: ProjectionInputV1 = {
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

      const inputB: ProjectionInputV1 = {
        monthlyContributions: [{ amount: money("25000"), fromMonth: 1 }],
        horizonMonths: 12,
        firstContributionDate: "2026-11-30",
        targetBasis: "FIXED_NOMINAL",
        target: money("400000"),
        opening: money("100000"),
        mode: "BASIC",
        schemaVersion: 1,
        schema: "projection-input",
      };

      const hashA = hashProjectionInput(inputA);
      const hashB = hashProjectionInput(inputB);

      expect(hashA).toMatch(/^[a-f0-9]{64}$/);
      expect(hashA).toBe(hashB);
      expect(canonicalJson(inputA)).toBe(canonicalJson(inputB));
    });
  });

  describe("Golden ADR-007 / ADR-012 date and contribution milestones", () => {
    it("reaches £4,000 at month 12 (31 October 2027) with £1,000 opening and £250/mo", () => {
      const input: ProjectionInputV1 = {
        schema: "projection-input",
        schemaVersion: 1,
        mode: "BASIC",
        opening: money("100000"), // £1,000.00
        target: money("400000"), // £4,000.00
        targetBasis: "FIXED_NOMINAL",
        firstContributionDate: "2026-11-30",
        horizonMonths: 12,
        monthlyContributions: [{ fromMonth: 1, amount: money("25000") }], // £250.00
      };

      const result = calculateProjection(input);

      expect(result.status).toBe("reachable");
      expect(result.firstQualifyingDate).toBe("2027-10-31");
      expect(result.series).toHaveLength(12);

      // Verify sequence dates and closing balances
      expect(result.series[0]).toEqual({
        month: 1,
        date: "2026-11-30",
        closing: money("125000"),
        target: money("400000"),
      });
      expect(result.series[3]).toEqual({
        month: 4,
        date: "2027-02-28", // February non-leap year
        closing: money("200000"),
        target: money("400000"),
      });
      expect(result.series[11]).toEqual({
        month: 12,
        date: "2027-10-31",
        closing: money("400000"),
        target: money("400000"),
      });

      // Breakdown conservation
      expect(result.breakdown).toEqual({
        opening: money("100000"),
        contributions: money("300000"),
        withdrawals: money("0"),
        growth: money("0"),
        proportionalFees: money("0"),
        fixedFees: money("0"),
        tax: money("0"),
        closing: money("400000"),
      });
      expect(result.warnings).toContain("UNMODELLED_FEES");
      expect(result.warnings).toContain("UNMODELLED_TAX");
    });

    it("reaches £4,000 at month 11 (30 September 2027) with £290/mo", () => {
      const input: ProjectionInputV1 = {
        schema: "projection-input",
        schemaVersion: 1,
        mode: "BASIC",
        opening: money("100000"),
        target: money("400000"),
        targetBasis: "FIXED_NOMINAL",
        firstContributionDate: "2026-11-30",
        horizonMonths: 12,
        monthlyContributions: [{ fromMonth: 1, amount: money("29000") }], // £290.00
      };

      const result = calculateProjection(input);

      expect(result.status).toBe("reachable");
      expect(result.firstQualifyingDate).toBe("2027-09-30");
      expect(result.series[10]?.date).toBe("2027-09-30");
      expect(BigInt(result.series[10]!.closing.amountMinor)).toBe(419000n);
    });
  });

  describe("Calendar dates, month ends, and leap years", () => {
    it("respects leap year February 29 (2028 is a leap year)", () => {
      const input: ProjectionInputV1 = {
        schema: "projection-input",
        schemaVersion: 1,
        mode: "BASIC",
        opening: money("10000"),
        target: money("100000"),
        targetBasis: "FIXED_NOMINAL",
        firstContributionDate: "2028-01-31",
        horizonMonths: 4,
        monthlyContributions: [{ fromMonth: 1, amount: money("5000") }],
      };

      const result = calculateProjection(input);

      expect(result.series[0]?.date).toBe("2028-01-31");
      expect(result.series[1]?.date).toBe("2028-02-29"); // Leap day!
      expect(result.series[2]?.date).toBe("2028-03-31");
      expect(result.series[3]?.date).toBe("2028-04-30");
    });
  });

  describe("Every calculation status", () => {
    it("reports 'already_achieved' when opening balance meets target", () => {
      const input: ProjectionInputV1 = {
        schema: "projection-input",
        schemaVersion: 1,
        mode: "BASIC",
        opening: money("500000"),
        target: money("400000"),
        targetBasis: "FIXED_NOMINAL",
        firstContributionDate: "2026-11-30",
        horizonMonths: 6,
        monthlyContributions: [{ fromMonth: 1, amount: money("10000") }],
      };

      const result = calculateProjection(input);

      expect(result.status).toBe("already_achieved");
      expect(result.firstQualifyingDate).toBeNull();
      expect(result.series).toHaveLength(6);
    });

    it("reports 'beyond_horizon' when positive progress does not reach target in horizon", () => {
      const input: ProjectionInputV1 = {
        schema: "projection-input",
        schemaVersion: 1,
        mode: "BASIC",
        opening: money("100000"),
        target: money("500000"),
        targetBasis: "FIXED_NOMINAL",
        firstContributionDate: "2026-11-30",
        horizonMonths: 6,
        monthlyContributions: [{ fromMonth: 1, amount: money("10000") }],
      };

      const result = calculateProjection(input);

      expect(result.status).toBe("beyond_horizon");
      expect(result.firstQualifyingDate).toBeNull();
      expect(result.breakdown.closing).toEqual(money("160000"));
    });

    it("reports 'depleted' when outflows reduce balance to zero", () => {
      const input: ProjectionInputV1 = {
        schema: "projection-input",
        schemaVersion: 1,
        mode: "ADVANCED",
        scenarioId: scenarioId,
        opening: money("10000"),
        target: money("500000"),
        targetBasis: "FIXED_NOMINAL",
        firstContributionDate: "2026-11-30",
        horizonMonths: 3,
        monthlyContributions: [{ fromMonth: 1, amount: money("0") }],
        withdrawals: [{ month: 1, amount: money("10000") }],
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
      };

      const result = calculateProjection(input);

      expect(result.status).toBe("depleted");
      expect(result.breakdown.closing).toEqual(money("0"));
    });

    it("reports 'budget_deficit' when scheduled outflows exceed available funds", () => {
      const input: ProjectionInputV1 = {
        schema: "projection-input",
        schemaVersion: 1,
        mode: "ADVANCED",
        scenarioId: scenarioId,
        opening: money("5000"),
        target: money("500000"),
        targetBasis: "FIXED_NOMINAL",
        firstContributionDate: "2026-11-30",
        horizonMonths: 3,
        monthlyContributions: [{ fromMonth: 1, amount: money("0") }],
        withdrawals: [{ month: 1, amount: money("10000") }], // £100 outflow vs £50 balance
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
      };

      const result = calculateProjection(input);

      expect(result.status).toBe("budget_deficit");
      expect(result.breakdown.closing).toEqual(money("0"));
    });

    it("reports 'unreachable_under_assumptions' when returns and cash flow are declining", () => {
      const input: ProjectionInputV1 = {
        schema: "projection-input",
        schemaVersion: 1,
        mode: "ADVANCED",
        scenarioId: scenarioId,
        opening: money("50000"),
        target: money("100000"),
        targetBasis: "FIXED_NOMINAL",
        firstContributionDate: "2026-11-30",
        horizonMonths: 6,
        monthlyContributions: [{ fromMonth: 1, amount: money("0") }],
        withdrawals: [],
        fixedFees: [
          { month: 1, amount: money("500") },
          { month: 2, amount: money("500") },
        ],
        tax: [],
        grossAnnualRate: "-0.1", // -10% negative return
        proportionalFeeAnnualRate: "0.01", // 1% fee
        inflationAnnualRate: "0",
        rateProvenance: {
          growth: userRate,
          fee: userRate,
          inflation: userRate,
        },
      };

      const result = calculateProjection(input);

      expect(result.status).toBe("unreachable_under_assumptions");
      expect(result.firstQualifyingDate).toBeNull();
      expect(BigInt(result.breakdown.closing.amountMinor)).toBeLessThan(50000n);
    });
  });

  describe("Inflation and TODAYS_MONEY target adjustments", () => {
    it("inflates target under TODAYS_MONEY basis without changing nominal balance math", () => {
      const input: ProjectionInputV1 = {
        schema: "projection-input",
        schemaVersion: 1,
        mode: "ADVANCED",
        scenarioId: scenarioId,
        opening: money("100000"),
        target: money("200000"),
        targetBasis: "TODAYS_MONEY",
        firstContributionDate: "2026-11-30",
        horizonMonths: 12,
        monthlyContributions: [{ fromMonth: 1, amount: money("10000") }],
        withdrawals: [],
        fixedFees: [],
        tax: [],
        grossAnnualRate: "0",
        proportionalFeeAnnualRate: "0",
        inflationAnnualRate: "0.05", // 5% annual inflation
        rateProvenance: {
          growth: userRate,
          fee: userRate,
          inflation: userRate,
        },
      };

      const result = calculateProjection(input);

      // Target at month 12 should be inflated by 5%: £2,000 * 1.05 = £2,100 = 210000 minor
      const month12Target = BigInt(result.series[11]!.target.amountMinor);
      expect(month12Target).toBe(210000n);

      // Month 1 target is inflated slightly: (1.05)^(1/12) ≈ 1.00407412 -> 200815 minor
      const month1Target = BigInt(result.series[0]!.target.amountMinor);
      expect(month1Target).toBeGreaterThan(200000n);
    });
  });

  describe("Conservation, monotonicity and 600-month horizon", () => {
    it("conserves cash breakdown strictly", () => {
      const input: ProjectionInputV1 = {
        schema: "projection-input",
        schemaVersion: 1,
        mode: "ADVANCED",
        scenarioId: scenarioId,
        opening: money("100000"),
        target: money("500000"),
        targetBasis: "FIXED_NOMINAL",
        firstContributionDate: "2026-11-30",
        horizonMonths: 24,
        monthlyContributions: [{ fromMonth: 1, amount: money("15000") }],
        withdrawals: [{ month: 6, amount: money("20000") }],
        fixedFees: [{ month: 12, amount: money("1000") }],
        tax: [{ month: 18, amount: money("2500") }],
        grossAnnualRate: "0.06",
        proportionalFeeAnnualRate: "0.005",
        inflationAnnualRate: "0.02",
        rateProvenance: {
          growth: userRate,
          fee: userRate,
          inflation: illustrationRate,
        },
      };

      const result = calculateProjection(input);

      const opening = BigInt(result.breakdown.opening.amountMinor);
      const contributions = BigInt(result.breakdown.contributions.amountMinor);
      const withdrawals = BigInt(result.breakdown.withdrawals.amountMinor);
      const growth = BigInt(result.breakdown.growth.amountMinor);
      const propFees = BigInt(result.breakdown.proportionalFees.amountMinor);
      const fixedFees = BigInt(result.breakdown.fixedFees.amountMinor);
      const tax = BigInt(result.breakdown.tax.amountMinor);
      const closing = BigInt(result.breakdown.closing.amountMinor);

      // Verify exact conservation
      expect(
        opening +
          contributions -
          withdrawals +
          growth -
          propFees -
          fixedFees -
          tax,
      ).toBe(closing);
      expect(result.warnings).toContain("ILLUSTRATIVE_RATE");
    });

    it("verifies monotonicity: higher contributions yield strictly higher closing balances", () => {
      const baseInput: ProjectionInputV1 = {
        schema: "projection-input",
        schemaVersion: 1,
        mode: "BASIC",
        opening: money("100000"),
        target: money("1000000"),
        targetBasis: "FIXED_NOMINAL",
        firstContributionDate: "2026-11-30",
        horizonMonths: 24,
        monthlyContributions: [{ fromMonth: 1, amount: money("20000") }],
      };

      const higherInput: ProjectionInputV1 = {
        ...baseInput,
        monthlyContributions: [{ fromMonth: 1, amount: money("30000") }],
      };

      const resultBase = calculateProjection(baseInput);
      const resultHigher = calculateProjection(higherInput);

      expect(
        BigInt(resultHigher.breakdown.closing.amountMinor),
      ).toBeGreaterThan(BigInt(resultBase.breakdown.closing.amountMinor));
    });

    it("handles maximum 600-month horizon without memory issues or overflow", () => {
      const input: ProjectionInputV1 = {
        schema: "projection-input",
        schemaVersion: 1,
        mode: "ADVANCED",
        scenarioId: scenarioId,
        opening: money("500000"), // £5,000.00
        target: money("100000000"), // £1,000,000.00
        targetBasis: "FIXED_NOMINAL",
        firstContributionDate: "2026-11-30",
        horizonMonths: 600, // 50 years
        monthlyContributions: [{ fromMonth: 1, amount: money("50000") }], // £500.00/mo
        withdrawals: [],
        fixedFees: [],
        tax: [],
        grossAnnualRate: "0.07", // 7% annual growth
        proportionalFeeAnnualRate: "0.0075", // 0.75% fee
        inflationAnnualRate: "0.025",
        rateProvenance: {
          growth: userRate,
          fee: userRate,
          inflation: userRate,
        },
      };

      const startTime = performance.now();
      const result = calculateProjection(input);
      const duration = performance.now() - startTime;

      expect(result.series).toHaveLength(600);
      expect(result.status).toBe("reachable");
      expect(result.firstQualifyingDate).not.toBeNull();
      // Must compute in under 100 milliseconds
      expect(duration).toBeLessThan(100);
    });
  });
});
