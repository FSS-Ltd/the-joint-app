import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { financeFixture } from "./fixtures/native-finance.js";
import { flush } from "./fixtures/native-stream.js";
import { scope } from "./fixtures/native-stream.js";
import { account, id, load, text } from "./fixtures/native-read-ui.js";
import { elements, press } from "./fixtures/native-source-harness.js";
import { valueAccounts } from "../packages/domain/src/wealth/value-accounts.js";
import { deferred } from "./fixtures/native-stream.js";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(0);
});
afterEach(() => vi.useRealTimers());

it.each(["blur", "background"])(
  "conceals the authored account detail immediately on %s, aborting late reads",
  async (loss) => {
    const f = await financeFixture();
    const pending = deferred<ReturnType<typeof account>>();
    const read = vi
      .spyOn(f.finance.accounts, "read")
      .mockResolvedValueOnce(account({ householdId: scope.householdId }))
      .mockImplementationOnce(() => pending.promise);
    const Detail = load("accounts/detail-screen.tsx", {
      "../finance/context": { useNativeFinance: () => f.finance },
      "../finance/use-resource": { useFinanceResource: f.resource },
      "./account-facts": { AccountFacts: "facts" },
      "./owner-actions": { OwnerActions: "owner-actions" },
    }).AccountDetailScreen as (props: { accountId: string }) => unknown;
    const render = () => f.h.render(() => Detail({ accountId: id }));
    render();
    await flush();
    f.emit("event: change\ndata: {}\n\n");
    await flush();
    expect(text(render())).toContain("Current account");
    expect(read).toHaveBeenLastCalledWith(
      scope.householdId,
      id,
      expect.any(AbortSignal),
    );
    f.emit("event: change\ndata: {}\n\n");
    await flush();
    if (loss === "blur") f.h.focus(false);
    else f.h.app("background");
    expect(text(render())).not.toContain("Current account");
    expect(elements(render()).some((e) => e.type === "facts")).toBe(false);
    expect(read.mock.calls[1]?.[2].aborted).toBe(true);
    pending.resolve(
      account({ householdId: scope.householdId, label: "Late secret" }),
    );
    await flush();
    expect(text(render())).not.toContain("Late secret");
    f.close();
  },
);

it("uses the captured summary selection and preserves explicit scope recovery after generic status400", async () => {
  const f = await financeFixture();
  const summary = valueAccounts({
    householdId: scope.householdId,
    grantVersion: 0,
    asOfDate: "2026-11-04",
    calculatedAt: "2026-11-04T12:00:00.000Z",
    accounts: [],
  });
  const read = vi.spyOn(f.finance.wealth, "read").mockResolvedValue(summary);
  const View = load("home/summary-view.tsx", {
    "../finance/context": { useNativeFinance: () => f.finance },
    "../finance/use-resource": { useFinanceResource: f.resource },
    "./summary-card": { SummaryCard: "summary" },
  }).SummaryView as (props: {
    scope: { kind: "selected"; accountIds: string[] };
  }) => unknown;
  const render = () =>
    f.h.render(() => View({ scope: { kind: "selected", accountIds: [id] } }));
  render();
  await flush();
  f.emit("event: change\ndata: {}\n\n");
  await flush();
  expect(read).toHaveBeenCalledExactlyOnceWith(
    scope.householdId,
    [id],
    expect.any(AbortSignal),
  );
  expect(text(render())).toContain("Explicit selection");
  f.h.focus(false);
  expect(elements(render()).some((e) => e.type === "summary")).toBe(false);
  f.close();
  const retry = vi.fn();
  const Failed = load("home/summary-view.tsx", {
    "../finance/context": { useNativeFinance: () => ({ authority: scope }) },
    "../finance/use-resource": {
      useFinanceResource: () => ({
        kind: "error",
        message: "Check your selected accounts and try again.",
        retry,
      }),
    },
    "./summary-card": { SummaryCard: "summary" },
  }).SummaryView as (props: { scope: { kind: "visible" } }) => unknown;
  const tree = Failed({ scope: { kind: "visible" } });
  expect(text(tree)).toContain("Choose 1–50 accounts");
  expect(elements(tree).some((e) => e.type === "summary")).toBe(false);
  press(tree, "Retry summary");
  expect(retry).toHaveBeenCalledOnce();
});
