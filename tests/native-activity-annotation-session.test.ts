import { afterEach, beforeEach, expect, it, vi } from "vitest";
import * as contracts from "../packages/contracts/src/index.js";
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
  f.replaceFinance({
    ...f.finance,
    transactions: { ...f.finance.transactions, annotate },
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
  const hook = sourceExports(
    "apps/mobile/src/features/activity/use-annotation-write.ts",
    {
      ...deps,
      "../accounts/use-write-draft": draft,
      "../finance/errors": errors,
      "../finance/use-mutation": { useFinanceMutation: f.mutation },
      "./annotation-input": input,
      "./annotation-intent": intent,
      "./use-transaction-read": {
        useTransactionRead: () => ({
          state: { kind: "ready", value: live },
          reload: vi.fn(),
        }),
      },
    },
  ).useAnnotationWrite as (id: string) => AnnotationSession;
  const render = () => f.h.render(() => hook(initial.id));
  render();
  return {
    f,
    annotate,
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
