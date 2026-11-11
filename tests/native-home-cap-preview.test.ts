import { expect, it, vi } from "vitest";
import { householdId, load } from "./fixtures/native-read-ui.js";
import { elements } from "./fixtures/native-source-harness.js";

it("reads the current report through the spending subscription and labels its returned month", async () => {
  const readReport = vi.fn().mockResolvedValue({});
  const retry = vi.fn();
  const resource = vi.fn<
    (
      selector: unknown,
      read: (
        scope: { householdId: string },
        signal: AbortSignal,
      ) => Promise<unknown>,
    ) => unknown
  >(() => ({
    kind: "ready",
    value: {
      month: "2026-10",
      scope: [],
      budget: null,
      provenance: { latestRecordDate: null },
    },
    retry,
  }));
  const currentSpending = load("budgets/use-current-spending-report.ts", {
    "../finance/context": {
      useNativeFinance: () => ({
        authority: { householdId },
        spending: { readReport },
      }),
    },
    "../finance/use-resource": { useFinanceResource: resource },
  });
  const { HomeInsights: loadedHomeInsights } = load("home/home-insights.tsx", {
    "expo-router": { useRouter: () => ({ push: vi.fn() }) },
    "../accounts/account-labels": { displayDate: vi.fn() },
    "../budgets/cap-card": { CapCard: "cap" },
    "../budgets/cap-math": { categoryActual: vi.fn() },
    "../budgets/month-helpers": load("budgets/month-helpers.ts"),
    "../budgets/use-current-spending-report": currentSpending,
  });
  const HomeInsights = loadedHomeInsights as (props: {
    scope: unknown;
  }) => unknown;
  const visible = HomeInsights({ scope: { kind: "visible" } });
  const preview = elements(visible).find(
    (element) => typeof element.type === "function",
  );
  expect(preview).toBeDefined();
  const rendered = (preview!.type as (props: unknown) => unknown)(
    preview!.props,
  );
  expect(JSON.stringify(rendered)).toContain("October 2026");
  expect(resource.mock.calls[0]?.[0]).toEqual({
    kind: "spending",
    householdId,
  });
  const signal = new AbortController().signal;
  await resource.mock.calls[0]![1]({ householdId }, signal);
  expect(readReport).toHaveBeenCalledWith(
    householdId,
    "current",
    undefined,
    signal,
  );

  resource.mockClear();
  const selected = HomeInsights({
    scope: { kind: "selected", accountIds: [householdId] },
  });
  expect(
    elements(selected).some((element) => typeof element.type === "function"),
  ).toBe(false);
  expect(resource).not.toHaveBeenCalled();
});
