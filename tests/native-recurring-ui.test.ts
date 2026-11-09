import { describe, expect, it } from "vitest";
import type {
  BaselinesReport,
  RecurringCandidateDto,
} from "../packages/contracts/src/index.js";
import { elements } from "./fixtures/native-source-harness.js";
import { load, text } from "./fixtures/native-read-ui.js";

const { RecurringCard } = load("budgets/recurring-card.tsx") as {
  RecurringCard: (props: {
    candidates: readonly RecurringCandidateDto[];
  }) => unknown;
};

const { BaselinesCard } = load("budgets/baselines-card.tsx") as {
  BaselinesCard: (props: { report: BaselinesReport }) => unknown;
};

describe("RecurringCard UI component", () => {
  it("renders empty panel when no candidates detected", () => {
    const tree = RecurringCard({ candidates: [] });
    const rendered = text(tree);
    expect(rendered).toContain("Recurring commitments");
    expect(rendered).toContain(
      "No regular subscriptions or bills detected in the last 180 days.",
    );
  });

  it("renders recurring candidates with cadence and variable bill badges", () => {
    const candidates: RecurringCandidateDto[] = [
      {
        id: "cand-1",
        accountId: "00000000-0000-0000-0000-000000000001",
        currency: "GBP",
        normalisedMerchant: "netflix",
        cadence: "MONTHLY",
        occurrenceCount: 4,
        medianAmountMinor: "1599",
        meanAmountMinor: "1599",
        isVariable: false,
        firstDate: "2026-06-15",
        lastDate: "2026-09-15",
        confidence: "HIGH",
        category: "Entertainment",
        status: "CANDIDATE",
      },
      {
        id: "cand-2",
        accountId: "00000000-0000-0000-0000-000000000001",
        currency: "GBP",
        normalisedMerchant: "octopus energy",
        cadence: "MONTHLY",
        occurrenceCount: 3,
        medianAmountMinor: "6540",
        meanAmountMinor: "6547",
        isVariable: true,
        firstDate: "2026-06-02",
        lastDate: "2026-08-02",
        confidence: "MEDIUM",
        category: "Bills",
        status: "CANDIDATE",
      },
      {
        id: "cand-3",
        accountId: "00000000-0000-0000-0000-000000000001",
        currency: "GBP",
        normalisedMerchant: "cleaner",
        cadence: "WEEKLY",
        occurrenceCount: 5,
        medianAmountMinor: "2500",
        meanAmountMinor: "2500",
        isVariable: false,
        firstDate: "2026-08-01",
        lastDate: "2026-08-29",
        confidence: "HIGH",
        category: "Home",
        status: "CANDIDATE",
      },
    ];

    const tree = RecurringCard({ candidates });
    const rendered = text(tree);

    expect(rendered).toContain("Recurring commitments");
    expect(rendered).toContain("netflix");
    expect(rendered).toContain("£15.99");
    expect(rendered).toContain("/month");
    expect(rendered).toContain("Entertainment");

    expect(rendered).toContain("octopus energy");
    expect(rendered).toContain("£65.40");
    expect(rendered).toContain("Variable bill");
    expect(rendered).toContain("Bills");

    expect(rendered).toContain("cleaner");
    expect(rendered).toContain("£25.00");
    expect(rendered).toContain("/week");

    // Accessibility labels
    const nodes = elements(tree);
    const accessibleRows = nodes.filter((n) => n.props?.accessible);
    expect(accessibleRows.length).toBeGreaterThanOrEqual(3);
  });
});

describe("BaselinesCard UI component", () => {
  it("renders insufficient history state when under 3 complete months", () => {
    const report: BaselinesReport = {
      calculatedAt: "2026-10-01T12:00:00Z",
      windows: [
        {
          windowMonths: 3,
          complete: false,
          months: ["2026-07", "2026-08", "2026-09"],
          meanSpendingMinor: "0",
          medianSpendingMinor: "0",
          meanIncomeMinor: "0",
          medianIncomeMinor: "0",
          percentile25IncomeMinor: null,
          currency: "GBP",
          isVariableIncome: false,
          insufficientHistory: true,
        },
      ],
      proposedBaselineSpendingMinor: null,
      proposedBaselineIncomeMinor: null,
      requiresIncomeConfirmation: false,
      insufficientHistory: true,
      scopeAccountIds: ["00000000-0000-0000-0000-000000000001"],
    };

    const tree = BaselinesCard({ report });
    const rendered = text(tree);
    expect(rendered).toContain("Spending baselines");
    expect(rendered).toContain(
      "Fewer than three complete calendar months with verified coverage are available.",
    );
  });

  it("renders 3, 6, 12 month baselines, highlighting discretionary baseline and 25th percentile", () => {
    const report: BaselinesReport = {
      calculatedAt: "2026-10-01T12:00:00Z",
      windows: [
        {
          windowMonths: 3,
          complete: true,
          months: ["2026-07", "2026-08", "2026-09"],
          meanSpendingMinor: "250000",
          medianSpendingMinor: "248000",
          meanIncomeMinor: "350000",
          medianIncomeMinor: "350000",
          percentile25IncomeMinor: null,
          currency: "GBP",
          isVariableIncome: false,
          insufficientHistory: false,
        },
        {
          windowMonths: 6,
          complete: true,
          months: [
            "2026-04",
            "2026-05",
            "2026-06",
            "2026-07",
            "2026-08",
            "2026-09",
          ],
          meanSpendingMinor: "240000",
          medianSpendingMinor: "242000",
          meanIncomeMinor: "350000",
          medianIncomeMinor: "350000",
          percentile25IncomeMinor: null,
          currency: "GBP",
          isVariableIncome: false,
          insufficientHistory: false,
        },
        {
          windowMonths: 12,
          complete: true,
          months: [
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
          ],
          meanSpendingMinor: "235000",
          medianSpendingMinor: "238000",
          meanIncomeMinor: "345000",
          medianIncomeMinor: "350000",
          percentile25IncomeMinor: "320000",
          currency: "GBP",
          isVariableIncome: true,
          insufficientHistory: false,
        },
      ],
      proposedBaselineSpendingMinor: "250000",
      proposedBaselineIncomeMinor: "350000",
      requiresIncomeConfirmation: true,
      insufficientHistory: false,
      scopeAccountIds: ["00000000-0000-0000-0000-000000000001"],
    };

    const tree = BaselinesCard({ report });
    const rendered = text(tree);

    expect(rendered).toContain("3-Month Mean Spending");
    expect(rendered).toContain("£2,500.00");
    expect(rendered).toContain("Proposed Monthly Income");
    expect(rendered).toContain("£3,500.00");
    expect(rendered).toContain("Variable income detected across past months.");

    expect(rendered).toContain("3-Month Complete Window");
    expect(rendered).toContain("6-Month Complete Window");
    expect(rendered).toContain("12-Month Complete Window");
    expect(rendered).toContain("Conservative 25th percentile income:");
    expect(rendered).toContain("£3,200.00");
  });
});
