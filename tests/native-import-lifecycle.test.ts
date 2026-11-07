import { readFileSync } from "node:fs";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import * as contracts from "../packages/contracts/src/index.js";
import * as errors from "../apps/mobile/src/features/finance/errors.js";
import * as result from "../apps/mobile/src/features/finance/result.js";
import { effectHarness } from "./fixtures/native-effect-harness.js";
import { financeFixture } from "./fixtures/native-finance.js";
import * as stateLabels from "../apps/mobile/src/features/imports/import-state-labels.js";
import { load } from "./fixtures/native-read-ui.js";
import {
  byLabel,
  expand,
  press,
  session,
} from "./fixtures/native-activity-ui.js";
import { sourceExports } from "./fixtures/native-source-harness.js";
import { flush } from "./fixtures/native-stream.js";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(0);
});
afterEach(() => vi.useRealTimers());

const key = "99999999-9999-4999-8999-999999999999";
let minted = 0;
const batch: contracts.ImportBatchResponse = {
  id: "11111111-1111-4111-8111-111111111111",
  accountId: "e237d3d7-236f-4ec3-8454-c4e5504d397f",
  state: "COMMITTED",
  version: 7,
  totalRows: 12,
  processedRows: 12,
  validRows: 10,
  rejectedRows: 0,
  overlapRows: 0,
  duplicateRows: 0,
  committedRows: 10,
  skippedRows: 0,
  failureCode: null,
  createdAt: "2026-11-04T10:00:00.000Z",
  committedAt: "2026-11-04T10:05:00.000Z",
  rolledBackAt: null,
  originalExpiresAt: null,
  originalAvailable: true,
  permissions: {
    canCommit: false,
    canRollback: true,
    canRestore: false,
    canDeleteOriginal: true,
  },
};
const withPermissions = (permissions: Partial<typeof batch.permissions>) => ({
  ...batch,
  permissions: { ...batch.permissions, ...permissions },
});
const input = () =>
  sourceExports("apps/mobile/src/features/imports/action-input.ts", {
    "@joint/contracts": contracts,
  }) as typeof import("../apps/mobile/src/features/imports/action-input.js");
const intents = () =>
  sourceExports("apps/mobile/src/features/imports/action-intent.ts", {
    "@joint/contracts": contracts,
    "../finance/errors": errors,
    "../accounts/write-intent": sourceExports(
      "apps/mobile/src/features/accounts/write-intent.ts",
      {
        "@joint/contracts": contracts,
        "../finance/result": result,
        "../finance/errors": errors,
      },
    ),
    "./action-input": input(),
  }) as typeof import("../apps/mobile/src/features/imports/action-intent.js");

it("allows each action only on the server's grant, and the file only while it is retained", () => {
  const api = input();
  expect(api.actionAllowed(batch, "rollback")).toBe(true);
  expect(api.actionAllowed(batch, "restore")).toBe(false);
  expect(api.actionAllowed(batch, "original")).toBe(true);
  expect(
    api.actionAllowed({ ...batch, originalAvailable: false }, "original"),
  ).toBe(false);
  expect(
    api.actionAllowed(withPermissions({ canRollback: false }), "rollback"),
  ).toBe(false);
  expect(
    api.actionAllowed(withPermissions({ canRestore: true }), "restore"),
  ).toBe(true);
});

it("rolls back and deletes the file with only the batch version, and restores with one key", async () => {
  const f = await financeFixture();
  const rollback = vi.fn(async () => batch);
  const deleteOriginal = vi.fn(async () => batch);
  const commit = vi.fn(async () => ({ batch, jobId: key }));
  const finance = {
    ...f.finance,
    imports: {
      ...f.finance.imports,
      rollback,
      deleteOriginal,
      commit,
    } as never,
  };
  const api = intents();
  await api.actionIntent(
    finance,
    batch,
    "rollback",
  )(new AbortController().signal);
  await api.actionIntent(
    finance,
    batch,
    "original",
  )(new AbortController().signal);
  expect(rollback.mock.calls[0]).toMatchObject([
    f.finance.authority.householdId,
    batch.id,
    7,
    expect.any(AbortSignal),
  ]);
  expect(deleteOriginal.mock.calls[0]).toMatchObject([
    f.finance.authority.householdId,
    batch.id,
    7,
    expect.any(AbortSignal),
  ]);
  const restorable = withPermissions({ canRestore: true });
  const restore = api.actionIntent(finance, restorable, "restore", key);
  await restore(new AbortController().signal);
  await restore(new AbortController().signal);
  expect(commit.mock.calls).toHaveLength(2);
  expect(commit.mock.calls[1]).toMatchObject([
    f.finance.authority.householdId,
    batch.id,
    { acceptRejectedRows: false },
    key,
    7,
    expect.any(AbortSignal),
  ]);
  f.close();
});

it("refuses an ungranted action and treats another batch in the response as uncertain", async () => {
  const f = await financeFixture();
  const api = intents();
  expect(() => api.actionIntent(f.finance, batch, "restore", key)).toThrow();
  expect(() =>
    api.actionIntent(
      f.finance,
      { ...batch, originalAvailable: false },
      "original",
    ),
  ).toThrow();
  const rollback = vi.fn(async () => ({
    ...batch,
    id: "22222222-2222-4222-8222-222222222222",
  }));
  const execute = api.actionIntent(
    { ...f.finance, imports: { ...f.finance.imports, rollback } as never },
    batch,
    "rollback",
  );
  await expect(execute(new AbortController().signal)).rejects.toMatchObject({
    outcome: "uncertain",
  });
  f.controller.blockMutations();
  await expect(execute(new AbortController().signal)).rejects.toMatchObject({
    code: "AUTHORITY_CHANGED",
  });
  expect(rollback).toHaveBeenCalledOnce();
  f.close();
});

it("runs each action once through the shared session and never when not granted", async () => {
  for (const [action, call, granted] of [
    ["rollback", "rollback", {}],
    ["original", "deleteOriginal", {}],
    ["restore", "commit", { canRestore: true }],
  ] as const) {
    const f = await financeFixture();
    const initial = withPermissions(granted);
    const spy = vi.fn<(...args: unknown[]) => Promise<unknown>>(async () =>
      call === "commit" ? { batch: initial, jobId: key } : initial,
    );
    f.replaceFinance({
      ...f.finance,
      imports: { ...f.finance.imports, [call]: spy } as never,
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
    const entity = sourceExports(
      "apps/mobile/src/features/writes/use-entity-write.ts",
      {
        ...deps,
        "../accounts/use-write-draft": draft,
        "../finance/errors": errors,
        "../finance/use-mutation": { useFinanceMutation: f.mutation },
      },
    );
    const hook = sourceExports(
      "apps/mobile/src/features/imports/use-import-action.ts",
      {
        "expo-crypto": {
          randomUUID: () =>
            `${key.slice(0, 8)}-0000-4000-8000-${String(++minted).padStart(12, "0")}`,
        },
        "../writes/use-entity-write": entity,
        "./action-input": input(),
        "./action-intent": intents(),
        "./use-import-read": {
          useImportRead: () => ({
            state: { kind: "ready", value: initial },
            reload: vi.fn(),
          }),
        },
      },
    ).useImportActionWrite as (
      id: string,
      action: string,
    ) => { allowed: boolean; submit(): Promise<void> };
    const render = () => f.h.render(() => hook(initial.id, action));
    render();
    await render().submit();
    await render().submit();
    expect(spy, action).toHaveBeenCalledOnce();
    if (action === "restore")
      expect(minted, "one key minted per submission").toBe(1);
    f.close();
  }
  const denied = await financeFixture();
  expect(
    input().actionAllowed(withPermissions({ canRollback: false }), "rollback"),
  ).toBe(false);
  denied.close();
});

function actionScreen(name: string, state: ReturnType<typeof session>) {
  const screens = load("imports/import-action-screen.tsx", {
    "./action-input": input(),
    "./import-batch-boundary": { ImportBatchBoundary: "boundary" },
    "./use-import-action": { useImportActionWrite: () => state },
  }) as Record<string, (props: { batchId: string }) => unknown>;
  return screens[name]!({ batchId: batch.id });
}

it("each action screen explains the consequence and runs through the session", () => {
  for (const [name, button] of [
    ["RollbackScreen", "Roll back import"],
    ["RestoreScreen", "Restore import"],
    ["OriginalScreen", "Delete the uploaded file"],
  ] as const) {
    const state = session(batch, {});
    const tree = actionScreen(name, state);
    expect(JSON.stringify(expand(tree)).length).toBeGreaterThan(80);
    expect(byLabel(tree, button)?.disabled).toBe(false);
    press(tree, button);
    expect(state.submit).toHaveBeenCalledOnce();
    const locked = actionScreen(name, session(batch, {}, { editable: false }));
    expect(byLabel(locked, button)?.disabled).toBe(true);
  }
});

function batchActions(value: Record<string, unknown>) {
  const push = vi.fn();
  const tree = (
    load("imports/import-batch-screen.tsx", {
      "./import-state-labels": stateLabels,
      "./action-input": input(),
      "expo-router": { useRouter: () => ({ replace: vi.fn(), push }) },
      "./use-import-batch": {
        useImportBatch: () => ({
          kind: "ready",
          value: { ...batch, ...value },
          retry: vi.fn(),
        }),
      },
    }).ImportBatchScreen as (props: { batchId: string }) => unknown
  )({ batchId: batch.id });
  return { tree, push };
}

it("batch screen offers rollback, restore and file deletion only where granted", () => {
  const all = batchActions({
    permissions: { ...batch.permissions, canRestore: true },
  });
  for (const [label, path] of [
    ["Roll back import", "rollback"],
    ["Restore import", "restore"],
    ["Delete the uploaded file", "original"],
  ] as const) {
    press(all.tree, label);
    expect(all.push).toHaveBeenCalledWith(`/imports/${batch.id}/${path}`);
  }
  const none = batchActions({
    originalAvailable: false,
    permissions: { ...batch.permissions, canRollback: false },
  });
  for (const label of [
    "Roll back import",
    "Restore import",
    "Delete the uploaded file",
  ])
    expect(byLabel(none.tree, label), label).toBeUndefined();
});

const focus = { value: true };
function historyScreen(state: unknown, extra: Record<string, unknown> = {}) {
  const h = effectHarness();
  const push = vi.fn();
  const replace = vi.fn();
  const history = {
    state,
    loadMore: vi.fn(),
    moreLoading: false,
    moreError: "",
    retry: vi.fn(),
    ...extra,
  };
  const Screen = load("imports/import-history-screen.tsx", {
    react: h.react,
    "expo-router": {
      useRouter: () => ({ push, replace }),
      useIsFocused: () => focus.value,
    },
    "./import-state-labels": stateLabels,
    "./use-import-history": { useImportHistory: () => history },
  }).ImportHistoryScreen as (props: { accountId: string }) => unknown;
  const render = () => h.render(() => Screen({ accountId: batch.accountId }));
  return { tree: render(), render, push, replace, history };
}

it("history lists batches newest first, opens one, loads more and offers a new import", () => {
  const h = historyScreen({
    kind: "ready",
    items: [batch, { ...batch, id: "33333333-3333-4333-8333-333333333333" }],
    cursor: "next",
  });
  const first = expand(h.tree).find((e) =>
    String(e.props.label).startsWith("Imported · 04/11/2026"),
  );
  (first?.props.onPress as () => void)();
  expect(h.push).toHaveBeenCalledWith(`/imports/${batch.id}`);
  press(h.tree, "Load more imports");
  expect(h.history.loadMore).toHaveBeenCalledOnce();
  press(h.tree, "Start a new import");
  expect(h.push).toHaveBeenCalledWith(`/imports/upload/${batch.accountId}`);
  expect(
    byLabel(
      historyScreen({ kind: "ready", items: [], cursor: null }).tree,
      "Load more imports",
    ),
  ).toBeUndefined();
  expect(
    JSON.stringify(
      expand(historyScreen({ kind: "ready", items: [], cursor: null }).tree),
    ),
  ).toContain("No imports yet");
  const failed = historyScreen({ kind: "error", message: "x" });
  press(failed.tree, "Retry imports");
  expect(failed.history.retry).toHaveBeenCalledOnce();
});

function historyHook() {
  const h = effectHarness();
  const finance = {
    authority: { householdId: "00000000-0000-4000-8000-000000000001" } as {
      householdId: string;
    },
    imports: { list: vi.fn() },
  };
  const hook = sourceExports(
    "apps/mobile/src/features/imports/use-import-history.ts",
    {
      react: h.react,
      "../finance/context": { useNativeFinance: () => finance },
      "../finance/errors": errors,
    },
  ).useImportHistory as (id: string) => {
    state: { kind: string; items?: unknown[]; cursor?: string | null };
    moreError: string;
    moreLoading: boolean;
    loadMore(): void;
  };
  const render = () => h.render(() => hook(batch.accountId));
  return { h, finance, render };
}
const second = { ...batch, id: "33333333-3333-4333-8333-333333333333" };

it("history reads a first page then appends the next, keeping the cursor", async () => {
  const t = historyHook();
  t.finance.imports.list
    .mockResolvedValueOnce({ items: [batch], nextCursor: "next" })
    .mockResolvedValueOnce({ items: [second], nextCursor: null });
  t.render();
  await flush();
  expect(t.render().state).toMatchObject({ items: [batch], cursor: "next" });
  expect(t.finance.imports.list.mock.calls[0]?.[1]).toMatchObject({
    accountId: batch.accountId,
    limit: 20,
  });
  t.render().loadMore();
  expect(t.render().moreLoading).toBe(true);
  await flush();
  const after = t.render();
  expect(after.state).toMatchObject({ items: [batch, second], cursor: null });
  expect(after.moreLoading).toBe(false);
  expect(t.finance.imports.list.mock.calls[1]?.[1]).toMatchObject({
    cursor: "next",
  });
  t.h.unmount();
});

it("history keeps the loaded pages and shows an inline error when load more fails", async () => {
  const t = historyHook();
  t.finance.imports.list
    .mockResolvedValueOnce({ items: [batch], nextCursor: "next" })
    .mockRejectedValueOnce(new errors.NativeApiError(503));
  t.render();
  await flush();
  t.render().loadMore();
  await flush();
  const view = t.render();
  expect(view.state).toMatchObject({ kind: "ready", items: [batch] });
  expect(view.moreError).not.toBe("");
  expect(view.moreLoading).toBe(false);
  t.h.unmount();
});

it("history aborts a page in flight when authority changes or the screen closes", async () => {
  const t = historyHook();
  const signals: AbortSignal[] = [];
  t.finance.imports.list.mockImplementation(
    (_h: string, _q: unknown, signal: AbortSignal) => {
      signals.push(signal);
      return signals.length === 1
        ? Promise.resolve({ items: [batch], nextCursor: "next" })
        : new Promise(() => {});
    },
  );
  t.render();
  await flush();
  t.render().loadMore();
  expect(signals).toHaveLength(2);
  t.finance.authority = { householdId: "other" };
  t.render();
  expect(signals[0]?.aborted).toBe(true);
  expect(signals[1]?.aborted).toBe(true);
  t.h.unmount();
});

it("history refreshes when the screen regains focus after an action, not on first show", () => {
  focus.value = true;
  const s = historyScreen({ kind: "ready", items: [], cursor: null });
  expect(s.history.retry).not.toHaveBeenCalled();
  focus.value = false;
  s.render();
  focus.value = true;
  s.render();
  expect(s.history.retry).toHaveBeenCalledOnce();
  s.render();
  expect(s.history.retry).toHaveBeenCalledOnce();
});

it("wires the lifecycle routes, history route, chooser link and stack screens without polling", () => {
  const root = "apps/mobile";
  for (const [file, symbol] of [
    ["[batchId]/rollback.tsx", "RollbackScreen"],
    ["[batchId]/restore.tsx", "RestoreScreen"],
    ["[batchId]/original.tsx", "OriginalScreen"],
    ["history/[accountId].tsx", "ImportHistoryRoute"],
  ] as const)
    expect(
      readFileSync(`${root}/app/(workspace)/imports/${file}`, "utf8"),
      file,
    ).toContain(symbol);
  const layout = readFileSync(
    `${root}/app/(workspace)/imports/_layout.tsx`,
    "utf8",
  );
  for (const name of [
    "[batchId]/rollback",
    "[batchId]/restore",
    "[batchId]/original",
    "history/[accountId]",
  ])
    expect(layout, name).toContain(name);
  expect(
    readFileSync(
      `${root}/src/features/imports/import-accounts-screen.tsx`,
      "utf8",
    ),
  ).toContain("View import history");
  for (const file of [
    "use-import-history.ts",
    "import-action-screen.tsx",
    "use-import-action.ts",
  ])
    expect(
      readFileSync(`${root}/src/features/imports/${file}`, "utf8"),
    ).not.toMatch(/setInterval|setTimeout/);
});

it("explains a protected import in plain words with a reload", () => {
  for (const code of ["IMPORT_PROTECTED"]) {
    const failure = new errors.NativeApiError(409, code);
    expect(errors.financeRecovery(failure), code).toBe("reload");
    expect(errors.financeErrorMessage(failure), code).not.toBe(failure.message);
  }
});

it("history drops the previous household's list when authority is lost", async () => {
  const t = historyHook();
  t.finance.imports.list.mockResolvedValue({
    items: [batch],
    nextCursor: null,
  });
  t.render();
  await flush();
  expect(t.render().state.kind).toBe("ready");
  t.finance.authority = null as never;
  t.render();
  expect(t.render().state.kind).toBe("loading");
  t.h.unmount();
});

it("never offers deleting the file while the batch could still need it", () => {
  const api = input();
  for (const state of [
    "QUEUED",
    "PREVIEWING",
    "READY",
    "COMMITTING",
    "FAILED",
    "EXPIRED",
  ] as const)
    expect(api.actionAllowed({ ...batch, state }, "original"), state).toBe(
      false,
    );
  expect(api.actionAllowed({ ...batch, state: "COMMITTED" }, "original")).toBe(
    true,
  );
  expect(
    api.actionAllowed({ ...batch, state: "ROLLED_BACK" }, "original"),
  ).toBe(true);
});
