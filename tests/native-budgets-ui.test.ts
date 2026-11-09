/**
 * IOS6 — Native budget screen, cap card, and budget editor UI + component tests.
 */
import { describe, expect, it, vi } from "vitest";
import {
  capPosition,
  categoryActual,
  formatCapBalance,
  formatCapStatus,
  formatSavingImpact,
  hasNetRefund,
} from "../apps/mobile/src/features/budgets/cap-math.js";
import {
  parseBudgetLine,
  formatLineAmount,
  validateBudgetLines,
  buildBudgetPayload,
} from "../apps/mobile/src/features/budgets/budget-editor-helpers.js";
import {
  currentMobileMonth,
  previousMonth,
  nextMonth,
  formatMonthLabel,
} from "../apps/mobile/src/features/budgets/month-helpers.js";
import { NativeApiError } from "../apps/mobile/src/api/errors.js";
import * as financeErrors from "../apps/mobile/src/features/finance/errors.js";
import type { SpendingReport } from "../packages/contracts/src/index.js";
import {
  elements,
  hookHarness,
  press,
} from "./fixtures/native-source-harness.js";
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
        complete: false,
        version: 1,
        reviewedAt: null,
      },
    },
  ],
  coverage: {
    complete: false,
    closedPeriod: true,
    reasons: ["MISSING_HISTORY"],
    missingAccountIds: [id],
  },
  summary: {
    income: { amountMinor: "300000", currency: "GBP" },
    spending: { amountMinor: "9000", currency: "GBP" },
    netCash: { amountMinor: "291000", currency: "GBP" },
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
    unreviewedCount: 1,
    unclassifiedCount: 0,
    unknownDebtCount: 0,
    consumptionComplete: true,
    categories: [
      {
        category: "Groceries",
        grouped: false,
        spending: { amountMinor: "3200", currency: "GBP" },
        count: 3,
      },
      {
        category: null,
        grouped: false,
        spending: { amountMinor: "5800", currency: "GBP" },
        count: 5,
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
    version: 2,
    updatedAt: "2026-10-15T10:00:00.000Z",
    lines: [
      {
        category: "Groceries",
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

describe("formatCapBalance, formatCapStatus, formatSavingImpact, hasNetRefund", () => {
  it("shows 'left' for remaining status", () => {
    const pos = capPosition("5000", "3200");
    expect(formatCapBalance(pos)).toBe("£18.00 left");
    expect(formatCapStatus(pos)).toBe("Within cap");
    expect(formatSavingImpact("Groceries", pos)).toBeNull();
  });

  it("shows '£0.00 left · Limit reached' for reached status", () => {
    const pos = capPosition("5000", "5000");
    expect(formatCapBalance(pos)).toBe("£0.00 left · Limit reached");
    expect(formatCapStatus(pos)).toBe("Limit reached");
    expect(formatSavingImpact("Groceries", pos)).toBeNull();
  });

  it("shows 'over limit' and saving-plan impact copy for over status", () => {
    const pos = capPosition("5000", "5800");
    expect(formatCapBalance(pos)).toBe("£8.00 over limit");
    expect(formatCapStatus(pos)).toBe("Over limit");
    const copy = formatSavingImpact("Groceries", pos);
    expect(copy).toContain("£8.00");
    expect(copy).toContain("saving");
    expect(copy).toContain("does not move money");
  });

  it("detects net refund only when actual spend is negative", () => {
    expect(hasNetRefund("-800")).toBe(true);
    expect(hasNetRefund("0")).toBe(false);
    expect(hasNetRefund("3200")).toBe(false);
  });
});

describe("categoryActual from SpendingReport", () => {
  it("returns spending for named, null, and missing categories", () => {
    expect(categoryActual(baseReport, "Groceries")).toEqual({
      amountMinor: "3200",
      currency: "GBP",
    });
    expect(categoryActual(baseReport, null)).toEqual({
      amountMinor: "5800",
      currency: "GBP",
    });
    expect(categoryActual(baseReport, "Rent")).toEqual({
      amountMinor: "0",
      currency: "GBP",
    });
  });
});

describe("budget-editor-helpers", () => {
  it("parses valid GBP strings and rejects negative or malformed inputs", () => {
    expect(parseBudgetLine("50.00")).toBe("5000");
    expect(parseBudgetLine("50")).toBe("5000");
    expect(parseBudgetLine("0.50")).toBe("50");
    expect(() => parseBudgetLine("-10.00")).toThrow();
    expect(() => parseBudgetLine("abc")).toThrow();
    expect(() => parseBudgetLine("1.234")).toThrow();
  });

  it("formats minor units cleanly including negative guards", () => {
    expect(formatLineAmount("5000")).toBe("50.00");
    expect(formatLineAmount("50")).toBe("0.50");
    expect(formatLineAmount("0")).toBe("0.00");
    expect(formatLineAmount("-50")).toBe("-0.50");
  });

  it("validates category length, control chars, max 100 lines, duplicates, and amounts", () => {
    expect(
      validateBudgetLines([
        { category: "Groceries", amount: "50.00" },
        { category: "Rent", amount: "1000.00" },
      ]),
    ).toBeNull();

    expect(
      validateBudgetLines([
        { category: "Groceries", amount: "50.00" },
        { category: "Groceries", amount: "30.00" },
      ]),
    ).toMatch(/only appear once/i);

    expect(
      validateBudgetLines([{ category: "Groceries", amount: "-10.00" }]),
    ).toMatch(/non-negative/i);

    expect(
      validateBudgetLines([{ category: "A".repeat(81), amount: "10.00" }]),
    ).toMatch(/80 characters/i);

    expect(
      validateBudgetLines([{ category: "Bad\u0000Name", amount: "10.00" }]),
    ).toMatch(/control characters/i);

    const over100 = Array.from({ length: 101 }, (_, i) => ({
      category: `Cat ${i}`,
      amount: "1.00",
    }));
    expect(validateBudgetLines(over100)).toMatch(/at most 100/i);
  });

  it("builds budget payload skipping blank-amount lines and normalizing blank category to null", () => {
    const payload = buildBudgetPayload(
      [
        { category: "  Groceries  ", amount: "50.00" },
        { category: "Ignored", amount: "   " },
        { category: "   ", amount: "12.50" },
      ],
      [id],
    );
    expect(payload).toEqual({
      accountIds: [id],
      lines: [
        {
          category: "Groceries",
          limit: { amountMinor: "5000", currency: "GBP" },
        },
        {
          category: null,
          limit: { amountMinor: "1250", currency: "GBP" },
        },
      ],
    });
  });
});

describe("month-helpers", () => {
  it("computes currentMobileMonth, previousMonth, nextMonth, and formatMonthLabel", () => {
    expect(/^\d{4}-\d{2}$/.test(currentMobileMonth())).toBe(true);
    expect(previousMonth("2026-01")).toBe("2025-12");
    expect(previousMonth("2026-10")).toBe("2026-09");
    expect(nextMonth("2026-12")).toBe("2027-01");
    expect(nextMonth("2026-09")).toBe("2026-10");
    expect(formatMonthLabel("2026-11")).toBe("November 2026");
  });
});

describe("CapCard & BudgetEditor & BudgetScreen source-harness component tests", () => {
  it("renders CapCard with progressbar role, spent/cap value text, overspend copy, and net refund notice", () => {
    const h = hookHarness();
    const { CapCard, CapRuler } = load("budgets/cap-card.tsx", {
      react: h.react,
      "react-native": {
        View: "view",
        StyleSheet: { create: <T>(s: T) => s },
        Animated: {
          Value: class {
            setValue() {}
            stopAnimation() {}
          },
          View: "animated-view",
          loop: () => ({ start() {}, stop() {} }),
          sequence: () => ({}),
          timing: () => ({}),
        },
        AccessibilityInfo: {
          isReduceMotionEnabled: () => Promise.resolve(true),
          addEventListener: () => ({ remove() {} }),
        },
      },
      "./cap-math": load("budgets/cap-math.ts"),
    }) as {
      CapCard: (props: {
        line: {
          category: string | null;
          limit: { amountMinor: string; currency: "GBP" };
        };
        actual: { amountMinor: string; currency: "GBP" };
      }) => unknown;
      CapRuler: (props: Record<string, unknown>) => unknown;
    };

    const overTree = CapCard({
      line: {
        category: "Groceries",
        limit: { amountMinor: "5000", currency: "GBP" },
      },
      actual: { amountMinor: "5800", currency: "GBP" },
    });
    const rulerNode = elements(overTree).find((e) => e.type === CapRuler);
    expect(rulerNode).toBeDefined();
    const rulerTree = h.render(() =>
      CapRuler(rulerNode!.props as Record<string, unknown>),
    );
    const meter = elements(rulerTree).find(
      (e) => e.props.accessibilityRole === "progressbar",
    );
    expect(meter).toBeDefined();
    expect(meter?.props.accessibilityValue).toEqual({
      min: 0,
      max: 100,
      now: 100,
      text: "£58.00 spent of £50.00 cap, £8.00 over limit",
    });
    expect(text(overTree)).toContain(
      "£8.00 less to put toward saving if other spending stays as planned. This comparison does not move money.",
    );

    const refundTree = CapCard({
      line: {
        category: "Travel",
        limit: { amountMinor: "5000", currency: "GBP" },
      },
      actual: { amountMinor: "-800", currency: "GBP" },
    });
    expect(text(refundTree)).toContain(
      "Net refunds increase the remaining allowance.",
    );
  });

  it("fences BudgetEditor writes, surfaces 412 conflict reload button, revokes on 401, reconciles on 403, and sanitizes unknown errors", async () => {
    const h = hookHarness();
    const putBudget = vi.fn();
    const onSaved = vi.fn();
    const onReload = vi.fn();
    const revoke = vi.fn();
    const reconcile = vi.fn();
    const authority = {
      actor: "actor-1",
      userId: id,
      membershipId: id,
      householdId,
      grantVersion: 1,
    };
    const finance = {
      authority,
      isCurrent: () => true,
      identity: { revoke },
      reconcile,
    };

    const { BudgetEditor } = load("budgets/budget-editor.tsx", {
      react: h.react,
      "@/components/native-field": { NativeField: "field" },
      "../finance/context": { useNativeFinance: () => finance },
      "../finance/errors": financeErrors,
      "../finance/use-lifetime": { useFinanceLifetime: () => true },
      "./budget-editor-helpers": load("budgets/budget-editor-helpers.ts"),
    }) as {
      BudgetEditor: (props: {
        report: SpendingReport;
        householdId: string;
        spending: { putBudget: typeof putBudget };
        onSaved: () => void;
        onReload?: () => void;
      }) => unknown;
    };

    const render = () =>
      h.render(() =>
        BudgetEditor({
          report: baseReport,
          householdId,
          spending: { putBudget },
          onSaved,
          onReload,
        }),
      );

    // 1. Successful save
    putBudget.mockResolvedValueOnce(baseReport.budget);
    press(render(), "Save budget caps");
    await Promise.resolve();
    expect(putBudget).toHaveBeenCalledWith(
      householdId,
      "2026-10",
      {
        accountIds: [id],
        lines: [
          {
            category: "Groceries",
            limit: { amountMinor: "5000", currency: "GBP" },
          },
        ],
      },
      2,
      expect.any(AbortSignal),
    );
    expect(onSaved).toHaveBeenCalledTimes(1);

    // 2. 412 conflict shows Reload budget action
    putBudget.mockRejectedValueOnce(
      new NativeApiError(412, "VERSION_CONFLICT"),
    );
    press(render(), "Save budget caps");
    await Promise.resolve();
    const conflictTree = render();
    expect(text(conflictTree)).toContain(
      "The budget was updated by another session.",
    );
    press(conflictTree, "Reload budget");
    expect(onReload).toHaveBeenCalledTimes(1);

    // 3. Unknown Error is sanitized via financeErrorMessage (never raw message)
    putBudget.mockRejectedValueOnce(new Error("raw-internal-stack-secret"));
    press(render(), "Save budget caps");
    await Promise.resolve();
    const errTree = render();
    expect(text(errTree)).not.toContain("raw-internal-stack-secret");
    expect(text(errTree)).toContain(
      "We could not complete this request. Please try again.",
    );

    // 4. 403 triggers finance.reconcile
    putBudget.mockRejectedValueOnce(new NativeApiError(403, "FORBIDDEN"));
    press(render(), "Save budget caps");
    await Promise.resolve();
    expect(reconcile).toHaveBeenCalledWith(authority);

    // 5. 401 triggers finance.identity.revoke
    putBudget.mockRejectedValueOnce(new NativeApiError(401, "UNAUTHENTICATED"));
    press(render(), "Save budget caps");
    await Promise.resolve();
    expect(revoke).toHaveBeenCalledWith("actor-1");
  });

  it("renders BudgetScreen empty-scope guidance and month-end callout", () => {
    const h = hookHarness();
    const push = vi.fn();
    let reportState: {
      kind: "loading" | "ready" | "error";
      value?: SpendingReport;
      message?: string;
      visible: boolean;
      reload: () => void;
    } = {
      kind: "ready",
      value: { ...baseReport, scope: [] },
      visible: true,
      reload: vi.fn(),
    };

    const { BudgetScreen, CapList } = load("budgets/budget-screen.tsx", {
      react: h.react,
      "expo-router": { useRouter: () => ({ push }) },
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
      "./cap-card": { CapCard: "cap-card" },
      "./budget-editor": { BudgetEditor: "budget-editor" },
      "./cap-math": load("budgets/cap-math.ts"),
      "./month-helpers": load("budgets/month-helpers.ts"),
      "./month-selector": { MonthSelector: "month-selector" },
      "./use-spending-report": { useSpendingReport: () => reportState },
    }) as {
      BudgetScreen: () => { type: () => unknown };
      CapList: (props: Record<string, unknown>) => unknown;
    };

    // Empty scope renders "Your picture starts with an account" and navigates to /home/accounts
    const root = BudgetScreen();
    const screenTree = h.render(root.type);
    const capListNode = elements(screenTree).find((e) => e.type === CapList);
    expect(capListNode).toBeDefined();
    const emptyTree = CapList(capListNode!.props as Record<string, unknown>);
    expect(text(emptyTree)).toContain("Your picture starts with an account");
    press(emptyTree, "Open accounts");
    expect(push).toHaveBeenLastCalledWith("/home/accounts");

    // Non-empty scope renders CapCard, month-end callout, and BudgetEditor
    reportState = {
      kind: "ready",
      value: baseReport,
      visible: true,
      reload: vi.fn(),
    };
    const readyScreenTree = h.render(root.type);
    const readyCapListNode = elements(readyScreenTree).find(
      (e) => e.type === CapList,
    );
    const readyTree = CapList(
      readyCapListNode!.props as Record<string, unknown>,
    );
    expect(text(readyTree)).toContain("Review the month before reallocating");
    press(readyTree, "Review this month");
    expect(push).toHaveBeenLastCalledWith("/review");
  });

  it("fences useSpendingReport with useFinanceLifetime, conceals when hidden, revokes on 401, and reconciles on 404", async () => {
    const h = hookHarness();
    const readReport = vi.fn();
    const revoke = vi.fn();
    const reconcile = vi.fn();
    const authority = {
      actor: "actor-1",
      userId: id,
      membershipId: id,
      householdId,
      grantVersion: 1,
    };
    let visible = true;
    let capturedLifetime: { start(): void; stop(): void } | null = null;

    const { useSpendingReport } = load("budgets/use-spending-report.ts", {
      react: h.react,
      "../finance/context": {
        useNativeFinance: () => ({
          authority,
          isCurrent: () => true,
          spending: { readReport },
          identity: { revoke },
          reconcile,
        }),
      },
      "../finance/errors": financeErrors,
      "../finance/scope": { financeAuthorityKey: () => "auth-1" },
      "../finance/use-lifetime": {
        useFinanceLifetime: (
          _f: unknown,
          _a: unknown,
          lt: { start(): void; stop(): void },
        ) => {
          if (!capturedLifetime) {
            capturedLifetime = lt;
            lt.start();
          }
          return visible;
        },
      },
    }) as {
      useSpendingReport: (month: string) => {
        kind: "loading" | "ready" | "error";
        value?: SpendingReport;
        message?: string;
        visible: boolean;
        reload: () => void;
      };
    };

    readReport.mockResolvedValueOnce(baseReport);
    h.render(() => useSpendingReport("2026-10"));
    await Promise.resolve();
    await Promise.resolve();
    let state = h.render(() => useSpendingReport("2026-10"));
    expect(state.kind).toBe("ready");

    // Conceals immediately when visible is false or stop() is called
    visible = false;
    state = h.render(() => useSpendingReport("2026-10"));
    expect(state.kind).toBe("loading");
    visible = true;
    capturedLifetime!.stop();
    state = h.render(() => useSpendingReport("2026-10"));
    expect(state.kind).toBe("loading");

    // Restart and test 404 reconciliation + 401 revocation
    readReport.mockRejectedValueOnce(new NativeApiError(404, "NOT_FOUND"));
    capturedLifetime!.start();
    await Promise.resolve();
    await Promise.resolve();
    state = h.render(() => useSpendingReport("2026-10"));
    expect(state.kind).toBe("error");
    expect(reconcile).toHaveBeenCalledWith(authority);

    readReport.mockRejectedValueOnce(
      new NativeApiError(401, "UNAUTHENTICATED"),
    );
    state.reload();
    await Promise.resolve();
    await Promise.resolve();
    expect(revoke).toHaveBeenCalledWith("actor-1");
  });
});
