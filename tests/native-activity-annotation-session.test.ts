import { afterEach, beforeEach, expect, it, vi } from "vitest";
import * as contracts from "../packages/contracts/src/index.js";
import * as domain from "../packages/domain/src/index.js";
import * as cashFlow from "../packages/domain/src/cash-flow.js";
import * as errors from "../apps/mobile/src/features/finance/errors.js";
import * as result from "../apps/mobile/src/features/finance/result.js";
import { financeFixture } from "./fixtures/native-finance.js";
import { sourceExports } from "./fixtures/native-source-harness.js";

/** Local shape: importing the hook module would pull React Native globals into the root test project. */
interface AnnotationSession {
  allowed: boolean;
  editable: boolean;
  draft: {
    value: {
      category: string;
      classificationKind: string;
      merchant: string;
      note: string;
    };
    message: string;
    invalidated: boolean;
    base: { version: number } | null;
    clear(): void;
    change(value: AnnotationSession["draft"]["value"]): void;
  };
  submit(): Promise<void>;
}

interface SplitSession {
  allowed: boolean;
  draft: {
    value: {
      lines: { category: string; amount: string; classificationKind: string }[];
    };
    message: string;
    change(value: SplitSession["draft"]["value"]): void;
  };
  submit(override?: SplitSession["draft"]["value"]): Promise<void>;
}

interface LinkSession {
  allowed: boolean;
  draft: { message: string; change(value: { counterpart: unknown }): void };
  submit(): Promise<void>;
}
interface RemoveSession {
  allowed: boolean;
  draft: { message: string };
  submit(override?: { pair: unknown }): Promise<void>;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(0);
});
afterEach(() => vi.useRealTimers());

const row: contracts.TransactionResponse = {
  id: "11111111-1111-4111-8111-111111111111",
  accountId: "e237d3d7-236f-4ec3-8454-c4e5504d397f",
  bookedDate: "2026-11-04",
  money: { amountMinor: "-125", currency: "GBP" },
  description: "Synthetic coffee",
  source: "MANUAL",
  version: 3,
  createdAt: "2026-11-04T10:00:00.000Z",
  category: null,
  classificationKind: null,
  effectiveKind: null,
  classificationConfirmed: false,
  splits: [],
  transfer: null,
  merchant: null,
  note: { body: null, version: 0 },
  permissions: { canCorrect: true, canClassify: true, canNote: true },
};
async function setup(initial: contracts.TransactionResponse) {
  const f = await financeFixture();
  let live = initial;
  const annotate = vi.fn(async () => live);
  const confirmTransfer = vi.fn<(...args: unknown[]) => Promise<unknown>>(
    async () => ({
      id: "33333333-3333-4333-8333-333333333333",
      from: live,
      to: live,
    }),
  );
  const removeTransfer = vi.fn<(...args: unknown[]) => Promise<unknown>>(
    async () => ({
      id: "33333333-3333-4333-8333-333333333333",
      from: live,
      to: live,
    }),
  );
  const replaceSplits = vi.fn<(...args: unknown[]) => Promise<typeof live>>(
    async () => live,
  );
  f.replaceFinance({
    ...f.finance,
    transactions: {
      ...f.finance.transactions,
      annotate,
      replaceSplits,
      confirmTransfer: confirmTransfer as never,
      removeTransfer: removeTransfer as never,
    },
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
  const write = (name: string, extra: Record<string, unknown> = {}) =>
    sourceExports(`apps/mobile/src/features/activity/${name}.ts`, {
      "@joint/contracts": contracts,
      "../finance/result": result,
      "../finance/errors": errors,
      ...extra,
    });
  const input = write("annotation-input");
  const intent = write("annotation-intent", {
    "../accounts/write-intent": sourceExports(
      "apps/mobile/src/features/accounts/write-intent.ts",
      {
        "@joint/contracts": contracts,
        "../finance/result": result,
        "../finance/errors": errors,
      },
    ),
    "./annotation-input": input,
  });
  const entity = sourceExports(
    "apps/mobile/src/features/writes/use-entity-write.ts",
    {
      ...deps,
      "../accounts/use-write-draft": draft,
      "../finance/errors": errors,
      "../finance/use-mutation": { useFinanceMutation: f.mutation },
    },
  );
  const generic = sourceExports(
    "apps/mobile/src/features/activity/use-transaction-write.ts",
    {
      "../writes/use-entity-write": entity,
      "./use-transaction-read": {
        useTransactionRead: () => ({
          state: { kind: "ready", value: live },
          reload: vi.fn(),
        }),
      },
    },
  );
  const hook = sourceExports(
    "apps/mobile/src/features/activity/use-annotation-write.ts",
    {
      "./annotation-input": input,
      "./annotation-intent": intent,
      "./use-transaction-write": generic,
    },
  ).useAnnotationWrite as (id: string) => AnnotationSession;
  const splitInput = sourceExports(
    "apps/mobile/src/features/activity/split-input.ts",
    {
      "@joint/contracts": contracts,
      "@joint/domain": domain,
      "@joint/domain/cash-flow": cashFlow,
    },
  );
  const splitIntent = sourceExports(
    "apps/mobile/src/features/activity/split-intent.ts",
    {
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
      "./split-input": splitInput,
    },
  );
  const splitHook = sourceExports(
    "apps/mobile/src/features/activity/use-split-write.ts",
    {
      "./split-input": splitInput,
      "./split-intent": splitIntent,
      "./use-transaction-write": generic,
    },
  ).useSplitWrite as (id: string) => SplitSession;
  const transferInput = sourceExports(
    "apps/mobile/src/features/activity/transfer-input.ts",
    { "@joint/contracts": contracts },
  );
  const transferIntent = sourceExports(
    "apps/mobile/src/features/activity/transfer-intent.ts",
    {
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
      "./transfer-input": transferInput,
    },
  );
  const transferHooks = sourceExports(
    "apps/mobile/src/features/activity/use-transfer-write.ts",
    {
      "expo-crypto": {
        randomUUID: () => "99999999-9999-4999-8999-999999999999",
      },
      "./transfer-input": transferInput,
      "./transfer-intent": transferIntent,
      "./use-transaction-write": generic,
    },
  );
  const renderLink = () =>
    f.h.render(() =>
      (transferHooks.useTransferLinkWrite as (id: string) => LinkSession)(
        initial.id,
      ),
    );
  const renderRemove = () =>
    f.h.render(() =>
      (transferHooks.useTransferRemoveWrite as (id: string) => RemoveSession)(
        initial.id,
      ),
    );
  const renderSplit = () => f.h.render(() => splitHook(initial.id));
  const render = () => f.h.render(() => hook(initial.id));
  render();
  return {
    f,
    annotate,
    replaceSplits,
    confirmTransfer,
    removeTransfer,
    renderLink,
    renderRemove,
    renderSplit,
    render,
    setLive: (next: contracts.TransactionResponse) => (live = next),
  };
}

it("dispatches a changed draft once with the version it was loaded from", async () => {
  const s = await setup(row);
  s.render().draft.change({ ...s.render().draft.value, merchant: "Cafe" });
  s.setLive({ ...row, version: 9 });
  await s.render().submit();
  expect(s.annotate).toHaveBeenCalledOnce();
  expect(s.annotate.mock.calls[0]).toMatchObject([
    s.f.finance.authority.householdId,
    row.id,
    { merchant: "Cafe" },
    3,
    expect.any(AbortSignal),
  ]);
  await s.render().submit();
  expect(s.annotate).toHaveBeenCalledOnce();
  s.f.close();
});

it("reports an unchanged draft without calling the server and keeps the draft", async () => {
  const s = await setup(row);
  await s.render().submit();
  expect(s.annotate).not.toHaveBeenCalled();
  expect(s.render().draft.message).not.toBe("");
  s.f.close();
});

it("never opens a draft for a viewer", async () => {
  const s = await setup({
    ...row,
    permissions: { canCorrect: false, canClassify: false, canNote: false },
  });
  const view = s.render();
  expect(view.allowed).toBe(false);
  expect(view.editable).toBe(false);
  expect(view.draft.invalidated).toBe(true);
  await view.submit();
  expect(s.annotate).not.toHaveBeenCalled();
  s.f.close();
});

it("does not re-seed a cleared draft from the stale read, then seeds the fresh version", async () => {
  const s = await setup(row);
  s.render().draft.change({ ...s.render().draft.value, merchant: "Cafe" });
  s.render().draft.clear();
  expect(s.render().draft.base).toBeNull();
  s.setLive({ ...row, version: 9 });
  s.render();
  expect(s.render().draft.base?.version).toBe(9);
  s.f.close();
});

it("dispatches a balanced split once at the loaded version and refuses an unbalanced one", async () => {
  const s = await setup({
    ...row,
    money: { amountMinor: "-1000", currency: "GBP" },
    effectiveKind: "EXPENSE",
  });
  s.renderSplit();
  const view = s.renderSplit();
  view.draft.change({
    lines: [
      { category: "Food", amount: "-7.05", classificationKind: "EXPENSE" },
      { category: "", amount: "-2.00", classificationKind: "EXPENSE" },
    ],
  });
  await s.renderSplit().submit();
  expect(s.replaceSplits).not.toHaveBeenCalled();
  expect(s.renderSplit().draft.message).not.toBe("");
  s.renderSplit().draft.change({
    lines: [
      { category: "Food", amount: "-7.05", classificationKind: "EXPENSE" },
      { category: "", amount: "-2.95", classificationKind: "EXPENSE" },
    ],
  });
  await s.renderSplit().submit();
  expect(s.replaceSplits).toHaveBeenCalledOnce();
  expect(s.replaceSplits.mock.calls[0]).toMatchObject([
    s.f.finance.authority.householdId,
    row.id,
    {
      lines: [
        { money: { amountMinor: "-705" } },
        { money: { amountMinor: "-295" } },
      ],
    },
    3,
    expect.any(AbortSignal),
  ]);
  s.f.close();
});

it("clears an existing split with an explicit empty submission, and refuses a paired row", async () => {
  const saved = {
    ...row,
    money: { amountMinor: "-1000", currency: "GBP" as const },
    splits: [
      {
        id: "22222222-2222-4222-8222-222222222222",
        position: 0,
        category: null,
        money: { amountMinor: "-1000", currency: "GBP" as const },
        classificationKind: "EXPENSE" as const,
      },
    ],
  };
  const s = await setup(saved);
  s.renderSplit();
  await s.renderSplit().submit({ lines: [] });
  expect(s.replaceSplits.mock.calls[0]?.[2]).toEqual({ lines: [] });
  s.f.close();
  const paired = await setup({
    ...row,
    transfer: { confirmed: true, id: row.id, canRemove: true },
  });
  const view = paired.renderSplit();
  expect(view.allowed).toBe(false);
  await view.submit({ lines: [] });
  expect(paired.replaceSplits).not.toHaveBeenCalled();
  paired.f.close();
});

const mate: contracts.TransactionResponse = {
  ...row,
  id: "22222222-2222-4222-8222-222222222222",
  accountId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  money: { amountMinor: "125", currency: "GBP" },
  version: 8,
};
const paired = (tx: contracts.TransactionResponse) => ({
  ...tx,
  transfer: {
    confirmed: true,
    id: "33333333-3333-4333-8333-333333333333",
    canRemove: true,
  },
});

it("confirms a chosen pair once with both versions and one captured key, and refuses an empty choice", async () => {
  const s = await setup(row);
  s.renderLink();
  await s.renderLink().submit();
  expect(s.confirmTransfer).not.toHaveBeenCalled();
  expect(s.renderLink().draft.message).not.toBe("");
  s.renderLink().draft.change({ counterpart: mate });
  await s.renderLink().submit();
  expect(s.confirmTransfer).toHaveBeenCalledOnce();
  expect(s.confirmTransfer.mock.calls[0]).toMatchObject([
    s.f.finance.authority.householdId,
    {
      fromTransactionId: row.id,
      toTransactionId: mate.id,
      fromVersion: 3,
      toVersion: 8,
    },
    "99999999-9999-4999-8999-999999999999",
    expect.any(AbortSignal),
  ]);
  s.f.close();
});

it("never offers the link to a paired row or a viewer", async () => {
  const pairedRow = await setup(paired(row));
  expect(pairedRow.renderLink().allowed).toBe(false);
  pairedRow.f.close();
  const viewer = await setup({
    ...row,
    permissions: { canCorrect: false, canClassify: false, canNote: false },
  });
  expect(viewer.renderLink().allowed).toBe(false);
  viewer.f.close();
});

it("removes a pair only from the explicitly submitted pair whose versions match the open row", async () => {
  const s = await setup(paired(row));
  s.renderRemove();
  await s.renderRemove().submit();
  expect(s.removeTransfer).not.toHaveBeenCalled();
  const pair = {
    id: "33333333-3333-4333-8333-333333333333",
    from: paired(row),
    to: paired(mate),
  };
  await s
    .renderRemove()
    .submit({ pair: { ...pair, from: { ...paired(row), version: 9 } } });
  expect(s.removeTransfer).not.toHaveBeenCalled();
  expect(s.renderRemove().draft.message).not.toBe("");
  await s.renderRemove().submit({ pair });
  expect(s.removeTransfer).toHaveBeenCalledOnce();
  expect(s.removeTransfer.mock.calls[0]).toMatchObject([
    s.f.finance.authority.householdId,
    "33333333-3333-4333-8333-333333333333",
    { fromVersion: 3, toVersion: 8 },
    expect.any(AbortSignal),
  ]);
  s.f.close();
});
