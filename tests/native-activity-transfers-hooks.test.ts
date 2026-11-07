import { afterEach, beforeEach, expect, it, vi } from "vitest";
import * as contracts from "../packages/contracts/src/index.js";
import * as errors from "../apps/mobile/src/features/finance/errors.js";
import { effectHarness } from "./fixtures/native-effect-harness.js";
import { sourceExports } from "./fixtures/native-source-harness.js";
import { deferred, flush } from "./fixtures/native-stream.js";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(0);
});
afterEach(() => vi.useRealTimers());

const householdId = "00000000-0000-4000-8000-000000000001";
const mine = "e237d3d7-236f-4ec3-8454-c4e5504d397f";
const other = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const out: contracts.TransactionResponse = {
  id: "11111111-1111-4111-8111-111111111111",
  accountId: mine,
  bookedDate: "2026-11-04",
  money: { amountMinor: "-5000", currency: "GBP" },
  description: "Out",
  source: "MANUAL",
  version: 4,
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
const entry = (
  id: string,
  amountMinor: string,
): contracts.TransactionResponse => ({
  ...out,
  id,
  accountId: other,
  money: { amountMinor, currency: "GBP" },
});
const account = (id: string, ownership: "OWNED" | "SHARED") =>
  ({ id, label: id.slice(0, 4), ownership }) as never;
const ids = {
  a: "22222222-2222-4222-8222-222222222222",
  b: "33333333-3333-4333-8333-333333333333",
  c: "44444444-4444-4444-8444-444444444444",
};

type Candidates = ReturnType<
  typeof import("../apps/mobile/src/features/activity/use-transfer-candidates.js").useTransferCandidates
>;
function setup() {
  const h = effectHarness();
  const finance = {
    authority: { householdId },
    accounts: { list: vi.fn() },
    transactions: { list: vi.fn(), readTransfer: vi.fn() },
  };
  const input = sourceExports(
    "apps/mobile/src/features/activity/transfer-input.ts",
    { "@joint/contracts": contracts },
  );
  const deps = {
    react: h.react,
    "../finance/context": { useNativeFinance: () => finance },
    "../finance/errors": errors,
    "./transfer-input": input,
  };
  const candidates = sourceExports(
    "apps/mobile/src/features/activity/use-transfer-candidates.ts",
    deps,
  ).useTransferCandidates as (
    base: contracts.TransactionResponse | null,
  ) => Candidates;
  const pair = sourceExports(
    "apps/mobile/src/features/activity/use-transfer-pair.ts",
    deps,
  ).useTransferPair as (
    id: string | null,
    refresh?: unknown,
  ) => {
    state: { kind: string };
    reload(): void;
  };
  return { h, finance, candidates, pair };
}

it("offers only owned accounts other than the open one, then only exact opposite unpaired entries", async () => {
  const s = setup();
  s.finance.accounts.list.mockResolvedValue({
    items: [
      account(mine, "OWNED"),
      account(other, "OWNED"),
      account(ids.c, "SHARED"),
    ],
    nextCursor: null,
  });
  s.finance.transactions.list.mockResolvedValue({
    items: [
      entry(ids.a, "5000"),
      entry(ids.b, "4999"),
      {
        ...entry(ids.c, "5000"),
        transfer: { confirmed: true, id: ids.a, canRemove: true },
      },
    ],
    nextCursor: "next",
  });
  const render = () => s.h.render(() => s.candidates(out));
  render();
  await flush();
  const first = render();
  expect(first.accounts).toMatchObject({ kind: "ready" });
  expect(
    first.accounts.kind === "ready" && first.accounts.items.map((i) => i.id),
  ).toEqual([other]);
  first.choose(other);
  render();
  await flush();
  const picked = render();
  expect(s.finance.transactions.list.mock.calls[0]?.[1]).toMatchObject({
    accountId: other,
    limit: 50,
  });
  expect(
    picked.entries.kind === "ready" && picked.entries.items.map((i) => i.id),
  ).toEqual([ids.a]);
  s.finance.transactions.list.mockResolvedValueOnce({
    items: [entry(ids.b, "5000")],
    nextCursor: null,
  });
  picked.loadMore();
  await flush();
  const more = render();
  expect(s.finance.transactions.list.mock.calls[1]?.[1]).toMatchObject({
    cursor: "next",
  });
  expect(
    more.entries.kind === "ready" && more.entries.items.map((i) => i.id),
  ).toEqual([ids.a, ids.b]);
  s.h.unmount();
});

it("aborts a pending page when the screen unmounts or authority changes so it cannot publish late", async () => {
  const s = setup();
  s.finance.accounts.list.mockResolvedValue({
    items: [account(other, "OWNED")],
    nextCursor: null,
  });
  const signals: AbortSignal[] = [];
  const late = deferred<{ items: never[]; nextCursor: null }>();
  s.finance.transactions.list.mockImplementation(
    (_h: string, _q: unknown, signal: AbortSignal) => {
      signals.push(signal);
      return late.promise;
    },
  );
  const render = () => s.h.render(() => s.candidates(out));
  render();
  await flush();
  render().choose(other);
  render();
  await flush();
  expect(signals).toHaveLength(1);
  s.finance.authority = { householdId: "00000000-0000-4000-8000-000000000002" };
  render();
  expect(signals[0]?.aborted).toBe(true);
  s.h.unmount();
});

it("aborts an in-flight load-more request on unmount", async () => {
  const s = setup();
  s.finance.accounts.list.mockResolvedValue({
    items: [account(other, "OWNED")],
    nextCursor: null,
  });
  const signals: AbortSignal[] = [];
  s.finance.transactions.list.mockImplementation(
    (_h: string, _q: unknown, signal: AbortSignal) => {
      signals.push(signal);
      return signals.length === 1
        ? Promise.resolve({ items: [], nextCursor: "next" })
        : new Promise(() => {});
    },
  );
  const render = () => s.h.render(() => s.candidates(out));
  render();
  await flush();
  render().choose(other);
  render();
  await flush();
  render().loadMore();
  expect(signals).toHaveLength(2);
  s.h.unmount();
  expect(signals[1]?.aborted).toBe(true);
});

it("reads a confirmed pair once per id, stays idle without one, and aborts on change", async () => {
  const s = setup();
  const signals: AbortSignal[] = [];
  s.finance.transactions.readTransfer.mockImplementation(
    (_h: string, _id: string, signal: AbortSignal) => {
      signals.push(signal);
      return Promise.resolve({
        id: ids.a,
        from: out,
        to: entry(ids.b, "5000"),
      });
    },
  );
  let id: string | null = null;
  const render = () => s.h.render(() => s.pair(id));
  expect(render().state.kind).toBe("idle");
  expect(s.finance.transactions.readTransfer).not.toHaveBeenCalled();
  id = ids.a;
  render();
  await flush();
  expect(render().state.kind).toBe("ready");
  id = ids.c;
  render();
  expect(signals[0]?.aborted).toBe(true);
  expect(s.finance.transactions.readTransfer).toHaveBeenCalledTimes(2);
  s.h.unmount();
});

it("does not leave load-more stuck pending after the account changes mid-request", async () => {
  const s = setup();
  s.finance.accounts.list.mockResolvedValue({
    items: [account(other, "OWNED"), account(ids.c, "OWNED")],
    nextCursor: null,
  });
  s.finance.transactions.list
    .mockResolvedValueOnce({ items: [], nextCursor: "next" })
    .mockImplementationOnce(() => new Promise(() => {}))
    .mockResolvedValue({ items: [], nextCursor: null });
  const render = () => s.h.render(() => s.candidates(out));
  render();
  await flush();
  render().choose(other);
  render();
  await flush();
  render().loadMore();
  expect(render().moreLoading).toBe(true);
  render().choose(ids.c);
  render();
  await flush();
  expect(render().moreLoading).toBe(false);
  s.h.unmount();
});

it("retries only the entries without reloading the account list", async () => {
  const s = setup();
  s.finance.accounts.list.mockResolvedValue({
    items: [account(other, "OWNED")],
    nextCursor: null,
  });
  s.finance.transactions.list.mockResolvedValue({
    items: [],
    nextCursor: null,
  });
  const render = () => s.h.render(() => s.candidates(out));
  render();
  await flush();
  render().choose(other);
  render();
  await flush();
  render().retryEntries();
  render();
  await flush();
  expect(s.finance.accounts.list).toHaveBeenCalledTimes(1);
  expect(s.finance.transactions.list).toHaveBeenCalledTimes(2);
  s.h.unmount();
});

it("refetches the pair when the refresh key changes even if the pair id is unchanged", async () => {
  const s = setup();
  s.finance.transactions.readTransfer.mockImplementation(async () => ({
    id: ids.a,
    from: out,
    to: entry(ids.b, "5000"),
  }));
  let key: unknown = { version: 1 };
  const render = () => s.h.render(() => s.pair(ids.a, key));
  render();
  await flush();
  expect(s.finance.transactions.readTransfer).toHaveBeenCalledTimes(1);
  key = { version: 1 };
  render();
  await flush();
  expect(s.finance.transactions.readTransfer).toHaveBeenCalledTimes(2);
  s.h.unmount();
});
