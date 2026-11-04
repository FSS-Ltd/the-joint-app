import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { NativeFinanceContextValue } from "../apps/mobile/src/features/finance/context.js";
import type { NativeFinanceAuthority } from "../apps/mobile/src/features/finance/scope.js";
import { financeAuthorityKey } from "../apps/mobile/src/features/finance/scope.js";
import type { AccountResponse } from "../packages/contracts/src/index.js";
import type { FinanceResourceResult } from "../apps/mobile/src/features/finance/state.js";
import { NativeApiError } from "../apps/mobile/src/api/errors.js";
import { financeFixture } from "./fixtures/native-finance.js";
import { account, id, load } from "./fixtures/native-read-ui.js";
import { elements, press } from "./fixtures/native-source-harness.js";
import { deferred, flush } from "./fixtures/native-stream.js";

type ReadyFinance = NativeFinanceContextValue & {
  authority: NativeFinanceAuthority;
};
function ready(value: NativeFinanceContextValue): value is ReadyFinance {
  return value.authority !== null;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(0);
});
afterEach(() => vi.useRealTimers());

async function fixture() {
  const f = await financeFixture();
  const syncProvider = () => {
    const current = f.controller.getVerifiedIdentity();
    if (!current) throw Error("Expected verified identity");
    const value = f.renderProvider(current.me);
    if (!ready(value)) throw Error("Expected ready finance provider");
    f.replaceFinance(value);
    return value;
  };
  syncProvider();
  const secondId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
  const second = account({ id: secondId });
  const cursor = "issued-synthetic-page-two";
  const list = vi
    .spyOn(f.finance.accounts, "list")
    .mockImplementation(async (_householdId, page) =>
      page.cursor
        ? { items: [second], nextCursor: null }
        : { items: [account()], nextCursor: cursor },
    );
  const usePage = load("accounts/use-account-page.ts", {
    react: f.h.react,
    "../finance/context": { useNativeFinance: () => f.finance },
    "../finance/scope": { financeAuthorityKey },
    "../finance/use-resource": { useFinanceResource: f.resource },
  }).useAccountPage as () => {
    resource: FinanceResourceResult<{
      items: AccountResponse[];
      nextCursor: string | null;
    }>;
    firstPage: boolean;
    canGoBack: boolean;
    next(): void;
    previous(): void;
  };
  const Picker = load("accounts/scope-selection.tsx", {
    react: f.h.react,
    "@expo/ui": { Host: "host", Switch: "switch" },
    "./account-page": { AccountPage: "page" },
    "./account-labels": load("accounts/account-labels.ts"),
  }).ScopeSelection as (props: {
    initialIds: readonly string[];
    onApply(ids: string[]): void;
    onCancel(): void;
  }) => unknown;
  const apply = vi.fn();
  const render = () =>
    f.h.render(() => ({
      picker: Picker({ initialIds: [id], onApply: apply, onCancel: vi.fn() }),
      page: usePage(),
      mutation: f.mutation<string>("captured-account:version7:key"),
    }));
  render();
  await flush();
  f.emit("event: change\ndata: {}\n\n");
  await flush();
  render().page.next();
  render();
  await flush();
  f.emit("event: change\ndata: {}\n\n");
  await flush();
  expect(render().page.resource).toMatchObject({
    kind: "ready",
    value: { items: [{ id: secondId }] },
  });
  const picker = elements(render().picker)[0]!;
  const row = (picker.props.renderAccount as (a: typeof second) => unknown)(
    second,
  );
  const control = elements(row).find((e) => e.type === "switch")!;
  (control.props.onValueChange as (value: boolean) => void)(true);
  return { ...f, syncProvider, render, list, cursor, secondId, apply };
}

it.each(["pending", "uncertain"])(
  "keeps page/history, selected IDs, context and %s mutation intent through ordinary activity",
  async (status) => {
    const f = await fixture();
    try {
      const verified = f.controller.getVerifiedIdentity();
      const context = f.syncProvider();
      const pending = deferred<string>();
      const execute = vi.fn<(signal: AbortSignal) => Promise<string>>(() =>
        status === "pending"
          ? pending.promise
          : Promise.reject(new NativeApiError(0, undefined, "uncertain")),
      );
      const write = f.render().mutation.submit(execute);
      if (status === "uncertain") await write;
      expect(f.render().mutation.kind).toBe(status);
      const streams = f.send.mock.calls.length;
      const reads = f.list.mock.calls.length;
      f.controller.interact();
      await flush();
      expect(f.api.recordActivity).toHaveBeenCalledOnce();
      expect(f.api.readMe).toHaveBeenCalledOnce();
      expect(f.controller.getVerifiedIdentity()).toBe(verified);
      expect(f.syncProvider()).toBe(context);
      const result = f.render();
      expect(result.page.firstPage).toBe(false);
      expect(result.page.canGoBack).toBe(true);
      expect(result.page.resource).toMatchObject({
        kind: "ready",
        value: { items: [{ id: f.secondId }] },
      });
      expect(result.mutation.kind).toBe(status);
      expect(execute.mock.calls[0]?.[0].aborted).toBe(false);
      await flush();
      expect(f.send).toHaveBeenCalledTimes(streams);
      expect(f.list).toHaveBeenCalledTimes(reads);
      press(result.picker, "Use selected accounts");
      expect(f.apply).toHaveBeenCalledExactlyOnceWith([id, f.secondId]);
      if (status === "pending") {
        pending.resolve("captured-result");
        await write;
        expect(f.render().mutation).toMatchObject({
          kind: "success",
          value: "captured-result",
        });
      } else {
        await f.render().mutation.retry();
        expect(execute).toHaveBeenCalledTimes(2);
        expect(f.render().mutation.kind).toBe("uncertain");
      }
      result.page.previous();
      f.render();
      await flush();
      expect(f.send).toHaveBeenCalledTimes(streams + 1);
      const lastUrl = f.send.mock.calls.at(-1)?.[0];
      expect(String(lastUrl)).not.toContain("cursor=");
    } finally {
      f.close();
    }
  },
);

it("clears page/history and fences a pending operation across a true same-authority refresh", async () => {
  const f = await fixture();
  try {
    const before = f.syncProvider();
    const sameMe = f.controller.getVerifiedIdentity()!.me;
    f.api.readMe.mockResolvedValueOnce(sameMe);
    const pending = deferred<string>();
    const execute = vi.fn<(signal: AbortSignal) => Promise<string>>(
      () => pending.promise,
    );
    const write = f.render().mutation.submit(execute);
    const refresh = f.controller.refresh();
    expect(f.controller.getVerifiedIdentity()).toBeNull();
    expect(execute.mock.calls[0]?.[0].aborted).toBe(true);
    await refresh;
    expect(f.controller.getVerifiedIdentity()?.me).toBe(sameMe);
    expect(f.syncProvider()).not.toBe(before);
    const result = f.render();
    expect(result.page.firstPage).toBe(true);
    expect(result.page.canGoBack).toBe(false);
    expect(result.page.resource.kind).toBe("loading");
    pending.resolve("obsolete");
    await write;
    expect(f.render().mutation.kind).toBe("idle");
    await f.render().mutation.retry();
    expect(execute).toHaveBeenCalledOnce();
  } finally {
    f.close();
  }
});

it.each([
  "actor",
  "me",
  "household",
  "grant",
  "background",
  "expiry",
  "revoke",
])(
  "still invalidates verified identity for real %s changes",
  async (change) => {
    const f = await financeFixture();
    try {
      const verified = f.controller.getVerifiedIdentity()!;
      const seen: unknown[] = [];
      f.controller.subscribe(() =>
        seen.push(f.controller.getVerifiedIdentity()),
      );
      if (change === "background") f.controller.background();
      else if (change === "revoke") f.controller.revoke();
      else if (change === "expiry") {
        f.api.readDeadline.mockResolvedValueOnce({
          serverTime: new Date().toISOString(),
          expiresAt: new Date().toISOString(),
        });
        await vi.advanceTimersByTimeAsync(600000);
      } else if (change === "actor")
        await f.controller.identify("replacement:session");
      else {
        const me = structuredClone(verified.me);
        if (change === "household" && me.membership)
          me.membership.householdId = "00000000-0000-4000-8000-000000000009";
        if (change === "grant" && me.membership) me.membership.grantVersion++;
        f.api.readMe.mockResolvedValueOnce(me);
        await f.controller.refresh();
      }
      expect(seen).toContain(null);
      expect(f.controller.getVerifiedIdentity()).not.toBe(verified);
    } finally {
      f.close();
    }
  },
);
