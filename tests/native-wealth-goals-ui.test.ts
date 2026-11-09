import { describe, expect, it, vi } from "vitest";
import type {
  GoalDto,
  ProjectionRunDto,
  GoalAllocationPage,
  ContributionBudgetView,
} from "../packages/contracts/src/index.js";
import { elements, hookHarness } from "./fixtures/native-source-harness.js";
import { householdId, id, load, text } from "./fixtures/native-read-ui.js";

const goalId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const runId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const accountId = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const valuationId = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";

const baseGoal: GoalDto = {
  schema: "goal",
  schemaVersion: 1,
  id: goalId,
  householdId,
  name: "House Deposit",
  status: "ACTIVE",
  beneficiary: "ADULT",
  priority: 1,
  version: 1,
  target: { amountMinor: "5000000", currency: "GBP" }, // £50,000
  targetDate: "2030-01-01",
};

const baseRun: ProjectionRunDto = {
  id: runId,
  householdId,
  goalId,
  scenarioId: null,
  mode: "BASIC",
  asOfDate: "2026-11-01",
  calculatedAt: "2026-11-04T12:00:00.000Z",
  inputHash: "hash123",
  sourceRevision: 1,
  input: {
    schema: "projection-input",
    schemaVersion: 1,
    mode: "BASIC",
    targetBasis: "FIXED_NOMINAL",
    opening: { amountMinor: "1000000", currency: "GBP" }, // £10,000
    target: { amountMinor: "5000000", currency: "GBP" }, // £50,000
    firstContributionDate: "2026-11-30",
    horizonMonths: 24,
    monthlyContributions: [
      { fromMonth: 1, amount: { amountMinor: "200000", currency: "GBP" } },
    ],
  },
  result: {
    schema: "projection-result",
    schemaVersion: 1,
    status: "reachable",
    firstQualifyingDate: "2028-06-30",
    breakdown: {
      opening: { amountMinor: "1000000", currency: "GBP" },
      contributions: { amountMinor: "4800000", currency: "GBP" },
      growth: { amountMinor: "250000", currency: "GBP" },
      proportionalFees: { amountMinor: "10000", currency: "GBP" },
      fixedFees: { amountMinor: "0", currency: "GBP" },
      tax: { amountMinor: "0", currency: "GBP" },
      withdrawals: { amountMinor: "0", currency: "GBP" },
      closing: { amountMinor: "6040000", currency: "GBP" },
    },
    series: [
      {
        month: 6,
        date: "2027-04-30",
        closing: { amountMinor: "2200000", currency: "GBP" },
        target: { amountMinor: "5000000", currency: "GBP" },
      },
      {
        month: 12,
        date: "2027-10-31",
        closing: { amountMinor: "3400000", currency: "GBP" },
        target: { amountMinor: "5000000", currency: "GBP" },
      },
      {
        month: 18,
        date: "2028-04-30",
        closing: { amountMinor: "4600000", currency: "GBP" },
        target: { amountMinor: "5000000", currency: "GBP" },
      },
      {
        month: 20,
        date: "2028-06-30",
        closing: { amountMinor: "5020000", currency: "GBP" },
        target: { amountMinor: "5000000", currency: "GBP" },
      },
      {
        month: 24,
        date: "2028-10-31",
        closing: { amountMinor: "6040000", currency: "GBP" },
        target: { amountMinor: "5000000", currency: "GBP" },
      },
    ],
    warnings: [],
  },
  source: {
    status: "CURRENT",
    asOfDate: "2026-11-01",
    grantVersion: 1,
    valuations: [],
  },
} as unknown as ProjectionRunDto;

describe("GoalProgressCard", () => {
  const { GoalProgressCard } = load("goals/goal-progress-card.tsx") as {
    GoalProgressCard: (props: {
      goal: GoalDto;
      allocatedMinor?: bigint;
      onPress?: () => void;
    }) => unknown;
  };

  it("renders goal name, target amount, progress percentage and remaining amount", () => {
    const rendered = GoalProgressCard({
      goal: baseGoal,
      allocatedMinor: 2000000n, // £20,000 (40%)
    });
    const renderedText = text(rendered);

    expect(renderedText).toContain("House Deposit");
    expect(renderedText).toContain("40% funded");
    expect(renderedText).toContain("£20,000.00");
    expect(renderedText).toContain("£50,000.00");
    expect(renderedText).toContain("£30,000.00");
    expect(renderedText).toContain("to go");
    expect(renderedText).toContain("Target: ");
    expect(renderedText).toContain("2030-01-01");
    expect(renderedText).toContain("ACTIVE");
  });

  it("renders target reached when allocated meets or exceeds target", () => {
    const rendered = GoalProgressCard({
      goal: baseGoal,
      allocatedMinor: 5000000n, // 100%
    });
    const renderedText = text(rendered);

    expect(renderedText).toContain("100% funded");
    expect(renderedText).toContain("Target reached");
  });

  it("invokes onPress when pressed", () => {
    const onPress = vi.fn();
    const rendered = GoalProgressCard({
      goal: baseGoal,
      allocatedMinor: 0n,
      onPress,
    });
    const button = elements(rendered).find(
      (e) => e.props.accessibilityRole === "button",
    );
    expect(button).toBeDefined();
    (button?.props as { onPress?: () => void }).onPress?.();
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});

describe("ProjectionBreakdownCard", () => {
  const { ProjectionBreakdownCard } = load(
    "goals/projection-breakdown-card.tsx",
  ) as {
    ProjectionBreakdownCard: (props: { run: ProjectionRunDto }) => unknown;
  };

  it("renders on track reachable status with month milestone and financial metrics", () => {
    const rendered = ProjectionBreakdownCard({ run: baseRun });
    const renderedText = text(rendered);

    expect(renderedText).toContain("On track · 2028-06-30");
    expect(renderedText).toContain("Projected to reach target by 2028-06-30");
    expect(renderedText).toContain("£10,000.00"); // Opening
    expect(renderedText).toContain("£50,000.00"); // Target
    expect(renderedText).toContain("£60,400.00"); // Ending balance
    expect(renderedText).toContain("£48,000.00"); // Total contributed
    expect(renderedText).toContain("Basic Projection");
  });

  it("renders advanced breakdown row when mode is ADVANCED", () => {
    const advancedRun: ProjectionRunDto = {
      ...baseRun,
      mode: "ADVANCED",
    };
    const rendered = ProjectionBreakdownCard({ run: advancedRun });
    const renderedText = text(rendered);

    expect(renderedText).toContain("Advanced Scenario");
    expect(renderedText).toContain("Projected growth: ");
    expect(renderedText).toContain("£2,500.00");
    expect(renderedText).toContain("Fees drag:");
    expect(renderedText).toContain("£100.00");
  });

  it.each([
    [
      "already_achieved",
      "Target already achieved",
      "Allocated funding already meets or exceeds",
    ],
    [
      "beyond_horizon",
      "Reachable beyond horizon",
      "longer timeline than modelled",
    ],
    [
      "depleted",
      "Depletion projected",
      "Planned outflows or fees exceed funding",
    ],
    [
      "budget_deficit",
      "Contribution deficit",
      "Monthly scheduled contributions are insufficient",
    ],
    [
      "unreachable_under_assumptions",
      "Adjustment required",
      "Goal is unreachable under current",
    ],
  ] as const)(
    "renders status explanation for %s",
    (status, expectedTitle, expectedExplanation) => {
      const run: ProjectionRunDto = {
        ...baseRun,
        result: {
          ...baseRun.result,
          status,
          firstQualifyingDate: null,
        },
      };
      const rendered = ProjectionBreakdownCard({ run });
      const renderedText = text(rendered);
      expect(renderedText).toContain(expectedTitle);
      expect(renderedText).toContain(expectedExplanation);
    },
  );

  it("renders warnings for staleness and partial sources", () => {
    const warnedRun: ProjectionRunDto = {
      ...baseRun,
      result: {
        ...baseRun.result,
        warnings: ["PARTIAL_SOURCE", "UNMODELLED_FEES"],
      },
    };
    const rendered = ProjectionBreakdownCard({ run: warnedRun });
    const renderedText = text(rendered);

    expect(renderedText).toContain(
      "Limited source access: Some account valuations could not be verified.",
    );
    expect(renderedText).toContain(
      "Fees unmodelled: Basic mode assumes zero fee friction.",
    );
  });
});

describe("AllocationEditorCard", () => {
  const { AllocationEditorCard } = load("goals/allocation-editor-card.tsx") as {
    AllocationEditorCard: (props: {
      allocationsPage: GoalAllocationPage | null;
    }) => unknown;
  };

  it("renders empty state when no accounts allocated", () => {
    const emptyPage = {
      view: {
        householdId,
        goalId,
        asOfDate: "2026-11-01",
        accountIds: [],
        allocations: [],
      },
    } as unknown as GoalAllocationPage;
    const rendered = AllocationEditorCard({ allocationsPage: emptyPage });
    expect(text(rendered)).toContain("No accounts allocated to this goal yet.");
  });

  it("renders allocated accounts and total allocated sum", () => {
    const page = {
      view: {
        householdId,
        goalId,
        asOfDate: "2026-11-01",
        accountIds: [accountId],
        allocations: [
          {
            accountId,
            valuationId,
            basis: "FIXED",
            amount: { amountMinor: "1500000", currency: "GBP" },
          },
        ],
      },
    } as unknown as GoalAllocationPage;
    const rendered = AllocationEditorCard({ allocationsPage: page });
    const renderedText = text(rendered);

    expect(renderedText).toContain("Allocated funding");
    expect(renderedText).toContain("£15,000.00");
    expect(renderedText).toContain("source account");
    expect(renderedText).toContain("assigned");
  });
});

describe("ContributionPlanCard", () => {
  const { ContributionPlanCard } = load("goals/contribution-plan-card.tsx") as {
    ContributionPlanCard: (props: {
      contributions: ContributionBudgetView | null;
      goalId: string;
    }) => unknown;
  };

  it("renders empty state when no contribution plan active", () => {
    const emptyView = {
      budget: {
        householdId,
        capacity: {
          firstContributionDate: "2026-11-30",
          horizonMonths: 24,
          monthlyContributions: [
            {
              fromMonth: 1,
              amount: { amountMinor: "25000", currency: "GBP" },
            },
          ],
        },
      },
      plans: [],
      assessment: {
        firstContributionDate: "2026-11-30",
        months: [],
      },
    } as unknown as ContributionBudgetView;
    const rendered = ContributionPlanCard({ contributions: emptyView, goalId });
    expect(text(rendered)).toContain(
      "No automated or scheduled monthly savings contribution",
    );
  });

  it("renders active monthly contribution schedule", () => {
    const view = {
      budget: {
        householdId,
        capacity: {
          firstContributionDate: "2026-11-30",
          horizonMonths: 24,
          monthlyContributions: [
            {
              fromMonth: 1,
              amount: { amountMinor: "25000", currency: "GBP" },
            },
          ],
        },
      },
      plans: [
        {
          goalVersion: 1,
          priority: 1,
          status: "ACTIVE",
          plan: {
            schema: "contribution-plan",
            schemaVersion: 1,
            id: "plan-id-1234",
            householdId,
            goalId,
            version: 1,
            firstContributionDate: "2026-11-30",
            monthlyContributions: [
              {
                fromMonth: 1,
                amount: { amountMinor: "25000", currency: "GBP" },
              },
            ],
          },
        },
      ],
      assessment: {
        firstContributionDate: "2026-11-30",
        months: [],
      },
    } as unknown as ContributionBudgetView;
    const rendered = ContributionPlanCard({ contributions: view, goalId });
    const renderedText = text(rendered);

    expect(renderedText).toContain("Contribution schedule");
    expect(renderedText).toContain("£250.00");
    expect(renderedText).toContain("/ month");
    expect(renderedText).toContain("2026-11-30");
  });
});

describe("GoalsScreen", () => {
  it("renders loading, error and populated states with summary metrics", () => {
    const h = hookHarness();
    const reload = vi.fn();

    const mockGoalsState = {
      goals: [baseGoal],
      loading: false,
      error: null,
      reload,
    };

    const { GoalsScreen } = load("goals/goals-screen.tsx", {
      react: h.react,
      "expo-router": {
        useRouter: () => ({ push: vi.fn(), back: vi.fn() }),
      },
      "../finance/context": {
        useNativeFinance: () => ({
          authority: {
            actor: "actor-1",
            userId: id,
            membershipId: id,
            householdId,
            grantVersion: 1,
          },
        }),
      },
      "./use-goals-data": {
        useGoalsData: () => mockGoalsState,
      },
      "./goal-progress-card": load("goals/goal-progress-card.tsx"),
    }) as { GoalsScreen: () => unknown };

    const rendered = h.render(() => GoalsScreen());
    const renderedText = text(rendered);

    expect(renderedText).toContain("Goals & Wealth");
    expect(renderedText).toContain("active goal");
    expect(renderedText).toContain("in household");
    expect(renderedText).toContain("£50,000.00");
  });
});
