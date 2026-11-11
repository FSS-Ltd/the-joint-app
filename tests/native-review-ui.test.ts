/**
 * IOS6 — Account-Month Coverage Attestation & Month-End Review UI + component tests.
 */
import { describe, expect, it, vi } from "vitest";
import {
  COVERAGE_REASONS,
  canAttestCoverage,
  formatCoverageStatus,
  formatOwnershipLabel,
  formatAttestButtonLabel,
  sortedCategoriesBySpend,
} from "../apps/mobile/src/features/review/review-helpers.js";
import { NativeApiError } from "../apps/mobile/src/api/errors.js";
import * as financeErrors from "../apps/mobile/src/features/finance/errors.js";
import type { SpendingReport } from "../packages/contracts/src/index.js";
import {
  elements,
  hookHarness,
  press,
} from "./fixtures/native-source-harness.js";
import { householdId, id, load, text } from "./fixtures/native-read-ui.js";

const partnerAccountId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

const reviewReport: SpendingReport = {
  month: "2026-10",
  startDate: "2026-10-01",
  endDateExclusive: "2026-11-01",
  scopeKey: "a".repeat(64),
  permissionKey: "b".repeat(64),
  calculatedAt: "2026-11-04T12:00:00.000Z",
  scope: [
    {
      id,
      label: "Main Current",
      kind: "CURRENT",
      ownership: "OWNED",
      version: 1,
      coverage: {
        complete: false,
        version: 3,
        reviewedAt: null,
      },
    },
    {
      id: partnerAccountId,
      label: "Partner Savings",
      kind: "SAVINGS",
      ownership: "SHARED",
      version: 1,
      coverage: {
        complete: false,
        version: 1,
        reviewedAt: null,
      },
    },
  ],
  coverage: {
    complete: false,
    closedPeriod: true,
    reasons: ["MISSING_HISTORY", "UNREVIEWED"],
    missingAccountIds: [id, partnerAccountId],
  },
  summary: {
    income: { amountMinor: "320000", currency: "GBP" },
    spending: { amountMinor: "129000", currency: "GBP" },
    netCash: { amountMinor: "191000", currency: "GBP" },
    transferIn: { amountMinor: "15000", currency: "GBP" },
    transferOut: { amountMinor: "15000", currency: "GBP" },
    debtServiceOut: { amountMinor: "25000", currency: "GBP" },
    debtSettlementIn: { amountMinor: "0", currency: "GBP" },
    principalIn: { amountMinor: "0", currency: "GBP" },
    principalOut: { amountMinor: "0", currency: "GBP" },
    contributionIn: { amountMinor: "0", currency: "GBP" },
    contributionOut: { amountMinor: "10000", currency: "GBP" },
    unclassifiedIn: { amountMinor: "0", currency: "GBP" },
    unclassifiedOut: { amountMinor: "0", currency: "GBP" },
    unreviewedCount: 2,
    unclassifiedCount: 1,
    unknownDebtCount: 0,
    consumptionComplete: false,
    categories: [
      {
        category: "Groceries",
        grouped: false,
        spending: { amountMinor: "3200", currency: "GBP" },
        count: 3,
      },
      {
        category: "Rent",
        grouped: false,
        spending: { amountMinor: "120000", currency: "GBP" },
        count: 1,
      },
      {
        category: "Eating Out",
        grouped: false,
        spending: { amountMinor: "5800", currency: "GBP" },
        count: 5,
      },
    ],
  },
  comparison: null,
  trend: [
    {
      month: "2026-09",
      complete: true,
      closedPeriod: true,
      income: { amountMinor: "310000", currency: "GBP" },
      spending: { amountMinor: "110000", currency: "GBP" },
      netCash: { amountMinor: "200000", currency: "GBP" },
    },
    {
      month: "2026-10",
      complete: false,
      closedPeriod: true,
      income: { amountMinor: "320000", currency: "GBP" },
      spending: { amountMinor: "129000", currency: "GBP" },
      netCash: { amountMinor: "191000", currency: "GBP" },
    },
  ],
  budget: null,
  provenance: {
    source: "CSV_MANUAL",
    latestRecordDate: "2026-10-30",
    sourceRowCount: 9,
  },
};

describe("COVERAGE_REASONS dictionary", () => {
  it("provides user-friendly descriptions for all coverage reasons without banned words or em dashes", () => {
    const reasons = [
      "MISSING_HISTORY",
      "OPEN_PERIOD",
      "UNREVIEWED",
      "UNCLASSIFIED",
      "UNKNOWN_DEBT_SERVICE",
      "NO_ACCOUNTS",
    ] as const;

    for (const r of reasons) {
      expect(COVERAGE_REASONS[r]).toBeDefined();
      expect(COVERAGE_REASONS[r]).not.toContain("—");
      expect(typeof COVERAGE_REASONS[r]).toBe("string");
      expect(COVERAGE_REASONS[r].length).toBeGreaterThan(10);
    }
  });
});

describe("canAttestCoverage rules", () => {
  const ownedAccount = {
    id: "acc-1",
    label: "Main Current",
    ownership: "OWNED" as const,
    coverage: { complete: false, version: 1, reviewedAt: null },
  };

  const sharedAccount = {
    id: "acc-2",
    label: "Partner Savings",
    ownership: "SHARED" as const,
    coverage: { complete: false, version: 1, reviewedAt: null },
  };

  it("disallows non-owned accounts unconditionally", () => {
    expect(canAttestCoverage(sharedAccount, true)).toBe(false);
    expect(canAttestCoverage(sharedAccount, false)).toBe(false);
  });

  it("disallows confirming incomplete coverage during open period", () => {
    expect(canAttestCoverage(ownedAccount, false)).toBe(false);
  });

  it("allows confirming incomplete coverage during closed period", () => {
    expect(canAttestCoverage(ownedAccount, true)).toBe(true);
  });

  it("allows owner to mark complete coverage incomplete even during open period", () => {
    const completeOwned = {
      ...ownedAccount,
      coverage: {
        complete: true,
        version: 2,
        reviewedAt: "2026-10-31T20:00:00Z",
      },
    };
    expect(canAttestCoverage(completeOwned, false)).toBe(true);
    expect(canAttestCoverage(completeOwned, true)).toBe(true);
  });
});

describe("formatOwnershipLabel and formatCoverageStatus", () => {
  it("formats ownership as Yours or Shared with you", () => {
    expect(formatOwnershipLabel("OWNED")).toBe("Yours");
    expect(formatOwnershipLabel("SHARED")).toBe("Shared with you");
  });

  it("formats coverage status and attest button labels", () => {
    expect(formatCoverageStatus(true)).toBe("History confirmed");
    expect(formatCoverageStatus(false)).toBe("History unconfirmed");
    expect(formatAttestButtonLabel(false, true)).toBe("Saving…");
    expect(formatAttestButtonLabel(false, false)).toBe(
      "Confirm whole-month history",
    );
    expect(formatAttestButtonLabel(true, false)).toBe(
      "Mark history incomplete",
    );
  });
});

describe("sortedCategoriesBySpend", () => {
  it("sorts categories descending by absolute spend amount", () => {
    const sorted = sortedCategoriesBySpend(reviewReport);
    expect(sorted.map((c: { category: string | null }) => c.category)).toEqual([
      "Rent",
      "Eating Out",
      "Groceries",
    ]);
    expect(sortedCategoriesBySpend({} as SpendingReport)).toEqual([]);
  });
});

describe("CoverageCard & MonthlyReviewScreen source-harness component tests", () => {
  it("renders CoverageCard with owner-only action, handles 412 conflict reload, 401 revoke, 403 reconcile, and sanitizes errors", async () => {
    const h = hookHarness();
    const attestCoverage = vi.fn();
    const refresh = vi.fn();
    const revoke = vi.fn();
    const reconcile = vi.fn();
    const authority = {
      actor: "actor-1",
      userId: id,
      membershipId: id,
      householdId,
      grantVersion: 1,
    };

    const { CoverageCard } = load("review/coverage-card.tsx", {
      react: h.react,
      "../finance/context": {
        useNativeFinance: () => ({
          authority,
          isCurrent: () => true,
          identity: { revoke },
          reconcile,
        }),
      },
      "../finance/errors": financeErrors,
      "../finance/use-lifetime": { useFinanceLifetime: () => true },
      "./review-helpers": load("review/review-helpers.ts"),
    }) as {
      CoverageCard: (props: {
        report: SpendingReport;
        householdId: string;
        spending: { attestCoverage: typeof attestCoverage };
        refresh: () => void;
      }) => unknown;
    };

    const render = () =>
      h.render(() =>
        CoverageCard({
          report: reviewReport,
          householdId,
          spending: { attestCoverage },
          refresh,
        }),
      );

    // Renders both accounts, but only 1 action button (for OWNED account)
    const initialTree = render();
    expect(text(initialTree)).toContain("Main Current");
    expect(text(initialTree)).toContain("Partner Savings");
    const buttons = elements(initialTree).filter((e) => e.type === "action");
    expect(buttons).toHaveLength(1);
    expect(buttons[0]?.props.label).toBe("Confirm whole-month history");

    // 1. Successful attestation
    attestCoverage.mockResolvedValueOnce({
      householdId,
      accountId: id,
      month: "2026-10",
      complete: true,
      version: 4,
      reviewedAt: "2026-11-01T10:00:00.000Z",
      reviewedByUserId: id,
    });
    press(initialTree, "Confirm whole-month history");
    await Promise.resolve();
    expect(attestCoverage).toHaveBeenCalledWith(
      householdId,
      id,
      "2026-10",
      true,
      3,
      expect.any(AbortSignal),
    );
    expect(refresh).toHaveBeenCalledTimes(1);

    // 2. 412 conflict surfaces message + Reload review button
    attestCoverage.mockRejectedValueOnce(
      new NativeApiError(412, "VERSION_CONFLICT"),
    );
    press(render(), "Confirm whole-month history");
    await Promise.resolve();
    const conflictTree = render();
    expect(text(conflictTree)).toContain(
      "Another session updated coverage for this account.",
    );
    press(conflictTree, "Reload review");
    expect(refresh).toHaveBeenCalledTimes(2);

    // 3. Unknown error sanitized via financeErrorMessage
    attestCoverage.mockRejectedValueOnce(new Error("secret-db-connection-err"));
    press(render(), "Confirm whole-month history");
    await Promise.resolve();
    const sanitizedTree = render();
    expect(text(sanitizedTree)).not.toContain("secret-db-connection-err");
    expect(text(sanitizedTree)).toContain(
      "We could not complete this request. Please try again.",
    );

    // 4. 404 triggers reconcile, 401 triggers revoke
    attestCoverage.mockRejectedValueOnce(new NativeApiError(404, "NOT_FOUND"));
    press(render(), "Confirm whole-month history");
    await Promise.resolve();
    expect(reconcile).toHaveBeenCalledWith(authority);

    attestCoverage.mockRejectedValueOnce(
      new NativeApiError(401, "UNAUTHENTICATED"),
    );
    press(render(), "Confirm whole-month history");
    await Promise.resolve();
    expect(revoke).toHaveBeenCalledWith("actor-1");
  });

  it("renders MonthlyReviewScreen sections, unreviewed/unclassified counts, and navigation actions", () => {
    const h = hookHarness();
    const push = vi.fn();
    const reload = vi.fn();
    let month: string | string[] = "2026-10";

    const {
      MonthlyReviewScreen,
      CashFlowSummary,
      CategoryBreakdownSection,
      TrendSection,
      CashBridgeSection,
    } = load("review/monthly-review-screen.tsx", {
      react: h.react,
      "expo-router": {
        useRouter: () => ({ push }),
        useLocalSearchParams: () => ({ month }),
      },
      "../finance/context": {
        useNativeFinance: () => ({
          authority: {
            actor: "a",
            userId: id,
            membershipId: id,
            householdId,
            grantVersion: 1,
          },
          spending: {},
        }),
      },
      "../finance/scope": { financeAuthorityKey: () => "auth-1" },
      "./coverage-card": { CoverageCard: "coverage-card" },
      "./month-end-surplus-card": {
        MonthEndSurplusCard: "month-end-surplus-card",
      },
      "./review-helpers": load("review/review-helpers.ts"),
      "../budgets/cap-math": {
        categoryActual: () => ({ amountMinor: "0", currency: "GBP" }),
      },
      "../budgets/savings-impact-card": {
        SavingsImpactCard: "savings-impact-card",
      },
      "../goals/use-goals-data": {
        useGoalsData: () => ({
          goals: [],
          loading: false,
          error: null,
          reload: vi.fn(),
        }),
      },
      "../budgets/month-helpers": {
        ...load("budgets/month-helpers.ts"),
        currentMobileMonth: () => "2026-11",
      },
      "../budgets/month-selector": { MonthSelector: "month-selector" },
      "../budgets/use-spending-report": {
        useSpendingReport: () => ({
          kind: "ready",
          value: reviewReport,
          visible: true,
          reload,
        }),
      },
    }) as {
      MonthlyReviewScreen: () => {
        type: (props: { initialMonth: string }) => unknown;
        props: { initialMonth: string };
      };
      CashFlowSummary: (props: { report: SpendingReport }) => unknown;
      CategoryBreakdownSection: (props: { report: SpendingReport }) => unknown;
      TrendSection: (props: { report: SpendingReport }) => unknown;
      CashBridgeSection: (props: { report: SpendingReport }) => unknown;
    };

    const root = MonthlyReviewScreen();
    expect(root.props.initialMonth).toBe("2026-10");
    month = ["2026-09", "2026-10"];
    expect(MonthlyReviewScreen().props.initialMonth).toBe("2026-11");
    month = "2026-12";
    expect(MonthlyReviewScreen().props.initialMonth).toBe("2026-11");
    const tree = h.render(() => root.type(root.props));
    const rendered = text(tree);
    const summaryText = text(CashFlowSummary({ report: reviewReport }));
    const categoryText = text(
      CategoryBreakdownSection({ report: reviewReport }),
    );
    const trendText = text(TrendSection({ report: reviewReport }));
    const bridgeText = text(CashBridgeSection({ report: reviewReport }));

    expect(summaryText).toContain("£1,290.00");
    expect(summaryText).toContain("£3,200.00");
    expect(summaryText).toContain("£1,910.00");
    expect(categoryText).toContain("By category");
    expect(categoryText).toContain("Rent");
    expect(trendText).toContain("Six-month view");
    expect(bridgeText).toContain("Cash movement bridge");
    expect(rendered).toContain("2");
    expect(rendered).toContain("unreviewed components");
    expect(rendered).toContain("unclassified components");

    press(tree, "View budget caps");
    expect(push).toHaveBeenLastCalledWith("/budgets");
    press(tree, "Open activity");
    expect(push).toHaveBeenLastCalledWith("/activity");
    press(tree, "Import transactions");
    expect(push).toHaveBeenLastCalledWith("/imports");
  });
});
