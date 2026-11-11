import { describe, expect, it, vi } from "vitest";
import type {
  GoalDto,
  SpendingReport,
} from "../packages/contracts/src/index.js";
import {
  calculateCategoryVariance,
  calculateHouseholdSavingsImpact,
} from "../apps/mobile/src/features/budgets/savings-impact.js";
import * as savingsImpact from "../apps/mobile/src/features/budgets/savings-impact.js";
import { evaluateGoalTimelineFeedback } from "../apps/mobile/src/features/goals/goal-timeline-feedback.js";
import * as goalTimelineFeedback from "../apps/mobile/src/features/goals/goal-timeline-feedback.js";
import * as capMath from "../apps/mobile/src/features/budgets/cap-math.js";
import { hookHarness, press } from "./fixtures/native-source-harness.js";
import { householdId, id, load, text } from "./fixtures/native-read-ui.js";

const baseReport: SpendingReport = {
  month: "2026-10",
  startDate: "2026-10-01",
  endDateExclusive: "2026-11-01",
  scopeKey: "a".repeat(64),
  permissionKey: "b".repeat(64),
  calculatedAt: "2026-11-04T12:00:00.000Z",
  scope: [
    {
      id,
      label: "Joint Current",
      kind: "CURRENT",
      ownership: "OWNED",
      version: 1,
      coverage: {
        complete: true,
        version: 1,
        reviewedAt: "2026-11-01T10:00:00.000Z",
      },
    },
  ],
  coverage: {
    complete: true,
    closedPeriod: true,
    reasons: [],
    missingAccountIds: [],
  },
  summary: {
    income: { amountMinor: "300000", currency: "GBP" },
    spending: { amountMinor: "8500", currency: "GBP" },
    netCash: { amountMinor: "291500", currency: "GBP" },
    transferIn: { amountMinor: "0", currency: "GBP" },
    transferOut: { amountMinor: "0", currency: "GBP" },
    debtServiceOut: { amountMinor: "0", currency: "GBP" },
    debtSettlementIn: { amountMinor: "0", currency: "GBP" },
    principalIn: { amountMinor: "0", currency: "GBP" },
    principalOut: { amountMinor: "0", currency: "GBP" },
    contributionIn: { amountMinor: "0", currency: "GBP" },
    contributionOut: { amountMinor: "0", currency: "GBP" },
    unclassifiedIn: { amountMinor: "0", currency: "GBP" },
    unclassifiedOut: { amountMinor: "0", currency: "GBP" },
    unreviewedCount: 0,
    unclassifiedCount: 0,
    unknownDebtCount: 0,
    consumptionComplete: true,
    categories: [
      {
        category: "groceries",
        spending: { amountMinor: "3500", currency: "GBP" },
        grouped: false,
        count: 2,
      },
    ],
  },
  comparison: null,
  trend: [],
  budget: {
    id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    scopeId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    month: "2026-10",
    accountIds: [id],
    currency: "GBP",
    version: 1,
    updatedAt: "2026-10-15T10:00:00.000Z",
    lines: [
      {
        category: "groceries",
        limit: { amountMinor: "5000", currency: "GBP" },
      },
    ],
  },
  provenance: {
    source: "CSV_MANUAL",
    latestRecordDate: "2026-10-28",
    sourceRowCount: 8,
  },
};

const sampleGoal: GoalDto = {
  schema: "goal",
  schemaVersion: 1,
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  householdId,
  name: "House Deposit",
  status: "ACTIVE",
  beneficiary: "ADULT",
  priority: 1,
  version: 1,
  target: { amountMinor: "5000000", currency: "GBP" },
  targetDate: "2030-01-01",
};

describe("IOS10b: Category Variance Math", () => {
  it("pins £50 cap and £35 actual to £15 underspend", () => {
    const result = calculateCategoryVariance("5000", "3500");
    expect(result.varianceMinor).toBe("1500");
    expect(result.status).toBe("underspend");
  });

  it("pins £50 cap and £50 actual to reached limit", () => {
    const result = calculateCategoryVariance("5000", "5000");
    expect(result.varianceMinor).toBe("0");
    expect(result.status).toBe("reached");
  });

  it("pins £50 cap and £65 actual to £15 overspend", () => {
    const result = calculateCategoryVariance("5000", "6500");
    expect(result.varianceMinor).toBe("-1500");
    expect(result.status).toBe("overspend");
  });

  it("handles net refunds in category actual without integer overflow", () => {
    const result = calculateCategoryVariance("5000", "-1000");
    expect(result.varianceMinor).toBe("6000");
    expect(result.status).toBe("underspend");
  });
});

describe("IOS10b: Household Savings Impact Math", () => {
  it("calculates confirmed £200 saving with £15 net overspend yielding qualified £185", () => {
    const impact = calculateHouseholdSavingsImpact("20000", [
      { limitMinor: "5000", actualMinor: "6500" }, // -1500
    ]);
    expect(impact.scheduledSavingsMinor).toBe("20000");
    expect(impact.netOverspendMinor).toBe("1500");
    expect(impact.qualifiedSavingsMinor).toBe("18500");
    expect(impact.impactExplanation).toContain("15.00 less put toward savings");
  });

  it("offsets underspend in one cap against overspend in another without creating false cash", () => {
    const impact = calculateHouseholdSavingsImpact("20000", [
      { limitMinor: "5000", actualMinor: "3000" }, // +2000 underspend
      { limitMinor: "5000", actualMinor: "6500" }, // -1500 overspend
    ]);
    // Net variance: +500 (underspend)
    expect(impact.netCapVarianceMinor).toBe("500");
    expect(impact.netOverspendMinor).toBe("0");
    expect(impact.netUnderspendMinor).toBe("500");
    // Qualified savings remains scheduled savings (£200); does not inflate to £205
    expect(impact.qualifiedSavingsMinor).toBe("20000");
    expect(impact.impactExplanation).toContain(
      "Full planned savings qualified",
    );
    expect(impact.impactExplanation).toContain(
      "5.00 unspent across budget caps",
    );
  });

  it("fully absorbs savings when net overspend exceeds scheduled amount", () => {
    const impact = calculateHouseholdSavingsImpact("10000", [
      { limitMinor: "5000", actualMinor: "20000" }, // -15000 overspend
    ]);
    expect(impact.qualifiedSavingsMinor).toBe("0");
    expect(impact.impactExplanation).toContain(
      "Planned savings fully absorbed",
    );
  });

  it("handles zero or empty category caps gracefully", () => {
    const impact = calculateHouseholdSavingsImpact("20000", []);
    expect(impact.netCapVarianceMinor).toBe("0");
    expect(impact.qualifiedSavingsMinor).toBe("20000");
    expect(impact.impactExplanation).toBe(
      "No category caps active this month.",
    );
  });
});

describe("IOS10b: Goal Timeline Feedback Insufficiency Gates", () => {
  it("returns amount-only feedback when target amount is missing or zero", () => {
    const feedback = evaluateGoalTimelineFeedback({
      targetMinor: "0",
      allocatedMinor: "50000",
      monthlyContributionMinor: "10000",
    });
    expect(feedback.mode).toBe("amount-only");
    expect(feedback.sufficient).toBe(false);
    expect(feedback.reason).toContain("Target amount is not set");
  });

  it("returns amount-only feedback when linked account access was revoked", () => {
    const feedback = evaluateGoalTimelineFeedback({
      targetMinor: "100000",
      allocatedMinor: "50000",
      sourceAccessRevoked: true,
    });
    expect(feedback.mode).toBe("amount-only");
    expect(feedback.sufficient).toBe(false);
    expect(feedback.reason).toContain("access was revoked");
  });

  it("returns amount-only feedback when history is incomplete or unreviewed", () => {
    const feedback = evaluateGoalTimelineFeedback({
      targetMinor: "100000",
      allocatedMinor: "50000",
      historyIncomplete: true,
    });
    expect(feedback.mode).toBe("amount-only");
    expect(feedback.sufficient).toBe(false);
    expect(feedback.reason).toContain(
      "Transaction history is partial or unreviewed",
    );
  });

  it("returns amount-only feedback when opening valuation is missing without inventing cash", () => {
    const feedback = evaluateGoalTimelineFeedback({
      targetMinor: "100000",
      allocatedMinor: "0",
      hasOpeningBalance: false,
    });
    expect(feedback.mode).toBe("amount-only");
    expect(feedback.sufficient).toBe(false);
    expect(feedback.reason).toContain("Opening valuation is missing");
  });

  it("returns amount-only feedback when opening valuation is omitted or undefined", () => {
    const feedback = evaluateGoalTimelineFeedback({
      targetMinor: "100000",
      allocatedMinor: "10000",
      monthlyContributionMinor: "5000",
    });
    expect(feedback.mode).toBe("amount-only");
    expect(feedback.sufficient).toBe(false);
    expect(feedback.reason).toContain("Opening valuation is missing");
  });

  it("returns amount-only feedback when monthly contribution schedule is missing", () => {
    const feedback = evaluateGoalTimelineFeedback({
      targetMinor: "100000",
      allocatedMinor: "10000",
      hasOpeningBalance: true,
      monthlyContributionMinor: "0",
    });
    expect(feedback.mode).toBe("amount-only");
    expect(feedback.sufficient).toBe(false);
    expect(feedback.reason).toContain(
      "No recurring monthly contribution schedule",
    );
  });

  it("returns projected mode when all goal inputs are complete", () => {
    const feedback = evaluateGoalTimelineFeedback({
      targetMinor: "100000",
      allocatedMinor: "10000",
      monthlyContributionMinor: "5000",
      hasOpeningBalance: true,
    });
    expect(feedback.mode).toBe("projected");
    expect(feedback.sufficient).toBe(true);
  });
});

describe("IOS10b: Component Rendering", () => {
  it("renders SavingsImpactCard correctly with overspend and underspend", () => {
    const { SavingsImpactCard } = load("budgets/savings-impact-card.tsx", {
      "./savings-impact": savingsImpact,
    }) as {
      SavingsImpactCard: (props: {
        scheduledSavingsMinor?: string;
        capLines: readonly { limitMinor: string; actualMinor: string }[];
      }) => unknown;
    };

    const overspendUi = SavingsImpactCard({
      scheduledSavingsMinor: "20000",
      capLines: [{ limitMinor: "5000", actualMinor: "6500" }],
    });
    const overspendText = text(overspendUi);
    expect(overspendText).toContain("Planned savings");
    expect(overspendText).toContain("£200.00");
    expect(overspendText).toContain("Cap variance");
    expect(overspendText).toContain("-£15.00");
    expect(overspendText).toContain("Qualified savings");
    expect(overspendText).toContain("£185.00");

    const underspendUi = SavingsImpactCard({
      scheduledSavingsMinor: "20000",
      capLines: [{ limitMinor: "5000", actualMinor: "3000" }],
    });
    const underspendText = text(underspendUi);
    expect(underspendText).toContain("+£20.00");
    expect(underspendText).toContain("£200.00");

    const recorded = text(
      SavingsImpactCard({
        capLines: [{ limitMinor: "5000", actualMinor: "6500" }],
      }),
    );
    expect(recorded).toContain("Recorded cap variance");
    expect(recorded).toContain("-£15.00");
    expect(recorded).not.toContain("Qualified savings");
  });

  it("renders GoalTimelineFeedbackCard in amount-only mode when insufficient", () => {
    const { GoalTimelineFeedbackCard } = load(
      "goals/goal-timeline-feedback-card.tsx",
      {
        "./goal-timeline-feedback": goalTimelineFeedback,
      },
    ) as {
      GoalTimelineFeedbackCard: (props: {
        inputs: Parameters<typeof evaluateGoalTimelineFeedback>[0];
      }) => unknown;
    };

    const ui = GoalTimelineFeedbackCard({
      inputs: {
        targetMinor: "100000",
        allocatedMinor: "25000",
        hasOpeningBalance: false,
      },
    });
    const rendered = text(ui);
    expect(rendered).toContain("Amount-only goal status");
    expect(rendered).toContain("£250.00");
    expect(rendered).toContain("£1,000.00");
    expect(rendered).toContain("£750.00");
    expect(rendered).toContain("Opening valuation is missing");
  });

  it("renders MonthEndSurplusCard locked when coverage is incomplete", () => {
    const h = hookHarness();
    const { MonthEndSurplusCard } = load("review/month-end-surplus-card.tsx", {
      react: h.react,
      "../budgets/cap-math": capMath,
      "../budgets/savings-impact": savingsImpact,
    }) as {
      MonthEndSurplusCard: (props: {
        report: SpendingReport;
        goals: readonly GoalDto[];
        onConfirmAllocation?: (
          goalId: string,
          amountMinor: string,
        ) => Promise<void> | void;
      }) => unknown;
    };

    const incompleteReport: SpendingReport = {
      ...baseReport,
      coverage: {
        ...baseReport.coverage,
        complete: false,
      },
    };

    const ui = h.render(() =>
      MonthEndSurplusCard({
        report: incompleteReport,
        goals: [sampleGoal],
      }),
    );
    const rendered = text(ui);
    expect(rendered).toContain("Locked: Month review incomplete");
    expect(rendered).toContain("Unallocated cap allowances cannot be verified");
  });

  it("renders MonthEndSurplusCard with surplus and goal selection when complete", async () => {
    const h = hookHarness();
    const { MonthEndSurplusCard } = load("review/month-end-surplus-card.tsx", {
      react: h.react,
      "../budgets/cap-math": capMath,
      "../budgets/savings-impact": savingsImpact,
    }) as {
      MonthEndSurplusCard: (props: {
        report: SpendingReport;
        goals: readonly GoalDto[];
        onConfirmAllocation?: (
          goalId: string,
          amountMinor: string,
        ) => Promise<void> | void;
      }) => unknown;
    };

    const onConfirm = vi.fn();
    const render = () =>
      h.render(() =>
        MonthEndSurplusCard({
          report: baseReport, // £50 cap, £35 actual -> £15 underspend
          goals: [sampleGoal],
          onConfirmAllocation: onConfirm,
        }),
      );

    const ui = render();
    const rendered = text(ui);
    expect(rendered).toContain("Verified cap surplus");
    expect(rendered).toContain("£15.00");
    expect(rendered).toContain("House Deposit");

    press(ui, "Confirm £15.00 allocation");
    await Promise.resolve();
    expect(onConfirm).toHaveBeenCalledWith(sampleGoal.id, "1500");
  });

  it("renders MonthEndSurplusCard action disabled when onConfirmAllocation is omitted", () => {
    const h = hookHarness();
    const { MonthEndSurplusCard } = load("review/month-end-surplus-card.tsx", {
      react: h.react,
      "../budgets/cap-math": capMath,
      "../budgets/savings-impact": savingsImpact,
    }) as {
      MonthEndSurplusCard: (props: {
        report: SpendingReport;
        goals: readonly GoalDto[];
        onConfirmAllocation?: (
          goalId: string,
          amountMinor: string,
        ) => Promise<void> | void;
      }) => unknown;
    };

    const ui = h.render(() =>
      MonthEndSurplusCard({
        report: baseReport,
        goals: [sampleGoal],
      }),
    );
    const rendered = text(ui);
    expect(rendered).toContain("Allocation confirmation unavailable");
  });
});
