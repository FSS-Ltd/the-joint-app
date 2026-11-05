import { existsSync } from "node:fs";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { financeFixture } from "./fixtures/native-finance.js";
import { sourceExports } from "./fixtures/native-source-harness.js";
import { account } from "./fixtures/native-read-ui.js";
import * as intents from "../apps/mobile/src/features/accounts/write-intent.js";
import * as errors from "../apps/mobile/src/features/finance/errors.js";
import type { AccountWriteHook } from "../apps/mobile/src/features/accounts/write-state.js";
import type { AccountResponse } from "../packages/contracts/src/index.js";
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(0);
});
afterEach(() => vi.useRealTimers());
it("refuses stale current versions and a hidden refreshed resource without replacing the draft", async () => {
  const path = "apps/mobile/src/features/accounts/use-account-write.ts";
  expect(existsSync(path), "account write session exists").toBe(true);
  const f = await financeFixture();
  let live: AccountResponse | null = account({
    householdId: f.finance.authority.householdId,
  });
  const initial = live,
    patch = vi.fn(async () => initial);
  f.replaceFinance({
    ...f.finance,
    accounts: { ...f.finance.accounts, patch },
  });
  const deps = {
    react: f.h.react,
    "react-native": { AppState: f.h.appState },
    "expo-router": f.h.router,
    "../finance/context": { useNativeFinance: () => f.finance },
  };
  const lifetime = sourceExports(
    "apps/mobile/src/features/finance/use-lifetime.ts",
    deps,
  );
  const draft = sourceExports(
    "apps/mobile/src/features/accounts/use-write-draft.ts",
    { ...deps, "../finance/use-lifetime": lifetime },
  );
  const hook = sourceExports(path, {
    ...deps,
    "./use-write-draft": draft,
    "./write-intent": intents,
    "../finance/errors": errors,
    "../finance/use-resource": {
      useFinanceResource: () => ({
        kind: "ready",
        value: initial,
        current: () => live,
        retry: vi.fn(),
      }),
    },
    "../finance/use-mutation": { useFinanceMutation: f.mutation },
  }).useAccountWrite as AccountWriteHook;
  const render = () =>
    f.h.render(() =>
      hook(
        initial.id,
        "metadata",
        () => ({ label: "" }),
        (a) => ({ label: a.label }),
      ),
    );
  render();
  render().draft.change({ label: "Unsaved" });
  live = { ...initial, version: 2 };
  await render().submit({
    kind: "metadata",
    input: { label: "Unsaved", liquidity: "AVAILABLE" },
  });
  expect(patch).not.toHaveBeenCalled();
  expect(render().draft.value.label).toBe("Unsaved");
  live = null;
  await render().submit({
    kind: "metadata",
    input: { label: "Unsaved", liquidity: "AVAILABLE" },
  });
  expect(patch).not.toHaveBeenCalled();
  live = initial;
  await render().submit({
    kind: "metadata",
    input: { label: "Unsaved", liquidity: "AVAILABLE" },
  });
  expect(patch).toHaveBeenCalledOnce();
  f.close();
});
it("checks live resource availability synchronously before an old handler can capture a mutation", async () => {
  const { flush, scope } = await import("./fixtures/native-stream.js");
  const f = await financeFixture(),
    read = vi.fn(async () => "authorized");
  const render = () => f.h.render(() => f.resource(scope.selector, read));
  render();
  await flush();
  f.emit("event: change\ndata: {}\n\n");
  await flush();
  const ready = render();
  expect(ready).toHaveProperty("current");
  expect(ready.current()).toBe("authorized");
  read.mockImplementationOnce(() => new Promise(() => {}));
  f.emit("event: change\ndata: {}\n\n");
  await flush();
  expect(ready.current()).toBe(null);
  f.close();
  expect(ready.current()).toBe(null);
});
it("rejects a ready-v1 handler after ready-v2 arrives before React renders", async () => {
  const { flush, scope } = await import("./fixtures/native-stream.js");
  const f = await financeFixture(),
    read = vi.fn(async () => ({ revision: 1 }));
  const render = () => f.h.render(() => f.resource(scope.selector, read));
  render();
  await flush();
  f.emit("event: change\ndata: {}\n\n");
  await flush();
  const old = render();
  expect(old.current()).toEqual({ revision: 1 });
  read.mockResolvedValueOnce({ revision: 2 });
  f.emit("event: change\ndata: {}\n\n");
  await flush();
  expect(old.current()).toBe(null);
  expect(render().current()).toEqual({ revision: 2 });
  f.close();
});
it("retains an uncertain submitted valuation through its own commit hint and replays the same DTO/key/version", async () => {
  const { flush } = await import("./fixtures/native-stream.js");
  const f = await financeFixture();
  let live = account({ householdId: f.finance.authority.householdId });
  const read = vi
    .spyOn(f.finance.accounts, "read")
    .mockImplementation(async () => live);
  const value = vi
    .spyOn(f.finance.accounts, "value")
    .mockImplementation(async () => {
      live = { ...live, version: 2 };
      throw new errors.NativeApiError(0, undefined, "uncertain");
    });
  const deps = {
    react: f.h.react,
    "react-native": { AppState: f.h.appState },
    "expo-router": f.h.router,
    "../finance/context": { useNativeFinance: () => f.finance },
  };
  const lifetime = sourceExports(
    "apps/mobile/src/features/finance/use-lifetime.ts",
    deps,
  );
  const draft = sourceExports(
    "apps/mobile/src/features/accounts/use-write-draft.ts",
    { ...deps, "../finance/use-lifetime": lifetime },
  );
  const hook = sourceExports(
    "apps/mobile/src/features/accounts/use-account-write.ts",
    {
      ...deps,
      "./use-write-draft": draft,
      "./write-intent": intents,
      "../finance/errors": errors,
      "../finance/use-resource": { useFinanceResource: f.resource },
      "../finance/use-mutation": { useFinanceMutation: f.mutation },
    },
  ).useAccountWrite as AccountWriteHook;
  const render = () =>
    f.h.render(() =>
      hook(
        live.id,
        "valuation",
        () => ({ amount: "" }),
        () => ({ amount: "" }),
      ),
    );
  render();
  await flush();
  f.emit("event: change\ndata: {}\n\n");
  await flush();
  render();
  render();
  await render().submit({
    kind: "valuation",
    input: {
      money: { amountMinor: "123", currency: "GBP" },
      asOfDate: "2026-11-04",
    },
    key: "00000000-0000-4000-8000-000000000009",
  });
  expect(render().mutation.kind).toBe("uncertain");
  f.emit("event: change\ndata: {}\n\n");
  await flush();
  expect(render()).toMatchObject({
    stale: true,
    editable: false,
    mutation: { kind: "uncertain" },
    draft: { base: { version: 1 } },
  });
  await render().mutation.retry();
  expect(value).toHaveBeenCalledTimes(2);
  expect(value.mock.calls[1]?.slice(0, 5)).toEqual(
    value.mock.calls[0]?.slice(0, 5),
  );
  expect(read).toHaveBeenCalledTimes(2);
  f.h.app("background");
  expect(render().draft.base).toBe(null);
  expect(render().mutation.kind).toBe("idle");
  await render().mutation.retry();
  expect(value).toHaveBeenCalledTimes(2);
  f.close();
});
