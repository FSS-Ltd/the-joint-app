import { afterEach, beforeEach, expect, it, vi } from "vitest";
import * as contracts from "../packages/contracts/src/index.js";
import * as errors from "../apps/mobile/src/features/finance/errors.js";
import * as result from "../apps/mobile/src/features/finance/result.js";
import { effectHarness } from "./fixtures/native-effect-harness.js";
import { financeFixture } from "./fixtures/native-finance.js";
import { sourceExports } from "./fixtures/native-source-harness.js";
import { deferred, flush } from "./fixtures/native-stream.js";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(0);
});
afterEach(() => vi.useRealTimers());

const key = "99999999-9999-4999-8999-999999999999";
const householdId = "00000000-0000-4000-8000-000000000001";
const batch: contracts.ImportBatchResponse = {
  id: "11111111-1111-4111-8111-111111111111",
  accountId: "e237d3d7-236f-4ec3-8454-c4e5504d397f",
  state: "READY",
  version: 5,
  totalRows: 12,
  processedRows: 12,
  validRows: 10,
  rejectedRows: 0,
  overlapRows: 0,
  duplicateRows: 0,
  committedRows: 0,
  skippedRows: 0,
  failureCode: null,
  createdAt: "2026-11-04T10:00:00.000Z",
  committedAt: null,
  rolledBackAt: null,
  originalExpiresAt: null,
  originalAvailable: true,
  permissions: {
    canCommit: true,
    canRollback: false,
    canRestore: false,
    canDeleteOriginal: true,
  },
};

/** Local shapes: importing the hook modules would leak React Native globals into the root test project. */
interface ReviewSession {
  allowed: boolean;
  draft: {
    message: string;
    change(value: { choices: Record<number, string> }): void;
  };
  submit(): Promise<void>;
}
interface CommitSession {
  allowed: boolean;
  draft: { message: string; change(value: { acknowledged: boolean }): void };
  submit(): Promise<void>;
}

async function setup(initial: contracts.ImportBatchResponse) {
  const f = await financeFixture();
  const review = vi.fn<(...args: unknown[]) => Promise<unknown>>(
    async () => initial,
  );
  const commit = vi.fn<(...args: unknown[]) => Promise<unknown>>(async () => ({
    batch: initial,
    jobId: key,
  }));
  f.replaceFinance({
    ...f.finance,
    imports: { ...f.finance.imports, review, commit } as never,
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
  const input = sourceExports(
    "apps/mobile/src/features/imports/review-input.ts",
    { "@joint/contracts": contracts },
  );
  const intent = sourceExports(
    "apps/mobile/src/features/imports/review-intent.ts",
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
      "./review-input": input,
    },
  );
  const hooks = sourceExports(
    "apps/mobile/src/features/imports/use-import-review.ts",
    {
      "expo-crypto": { randomUUID: () => key },
      "../writes/use-entity-write": entity,
      "./review-input": input,
      "./review-intent": intent,
      "./use-import-read": {
        useImportRead: () => ({
          state: { kind: "ready", value: initial },
          reload: vi.fn(),
        }),
      },
    },
  );
  const renderReview = () =>
    f.h.render(() =>
      (hooks.useImportReviewWrite as (id: string) => ReviewSession)(initial.id),
    );
  const renderCommit = () =>
    f.h.render(() =>
      (hooks.useImportCommitWrite as (id: string) => CommitSession)(initial.id),
    );
  // One hook per setup: both would otherwise share the harness's hook slots.
  return { f, review, commit, renderReview, renderCommit };
}

it("saves chosen decisions once at the loaded batch version and refuses none", async () => {
  const s = await setup(batch);
  s.renderReview();
  await s.renderReview().submit();
  expect(s.review).not.toHaveBeenCalled();
  expect(s.renderReview().draft.message).not.toBe("");
  s.renderReview().draft.change({ choices: { 3: "KEEP", 8: "SKIP" } });
  await s.renderReview().submit();
  expect(s.review).toHaveBeenCalledOnce();
  expect(s.review.mock.calls[0]).toMatchObject([
    s.f.finance.authority.householdId,
    batch.id,
    {
      decisions: [
        { rowNumber: 3, decision: "KEEP" },
        { rowNumber: 8, decision: "SKIP" },
      ],
    },
    5,
    expect.any(AbortSignal),
  ]);
  s.f.close();
});

it("commits once with one key, and never while overlaps or unacknowledged rejects remain", async () => {
  const blocked = await setup({ ...batch, overlapRows: 2 });
  blocked.renderCommit();
  await blocked.renderCommit().submit();
  expect(blocked.commit).not.toHaveBeenCalled();
  blocked.f.close();
  const rejects = await setup({ ...batch, rejectedRows: 3 });
  rejects.renderCommit();
  await rejects.renderCommit().submit();
  expect(rejects.commit).not.toHaveBeenCalled();
  rejects.renderCommit().draft.change({ acknowledged: true });
  await rejects.renderCommit().submit();
  expect(rejects.commit).toHaveBeenCalledOnce();
  expect(rejects.commit.mock.calls[0]).toMatchObject([
    rejects.f.finance.authority.householdId,
    batch.id,
    { acceptRejectedRows: true },
    key,
    5,
    expect.any(AbortSignal),
  ]);
  rejects.f.close();
});

it("never opens a write for a batch that is not ready", async () => {
  for (const state of ["COMMITTING", "COMMITTED", "FAILED"] as const) {
    const review = await setup({ ...batch, state });
    review.renderReview();
    expect(review.renderReview().allowed, state).toBe(false);
    await review.renderReview().submit();
    expect(review.review).not.toHaveBeenCalled();
    review.f.close();
    const commit = await setup({ ...batch, state });
    commit.renderCommit();
    expect(commit.renderCommit().allowed, state).toBe(false);
    await commit.renderCommit().submit();
    expect(commit.commit).not.toHaveBeenCalled();
    commit.f.close();
  }
});

function fencedSetup() {
  const h = effectHarness();
  const finance = {
    authority: { householdId } as { householdId: string },
    imports: { read: vi.fn(), rows: vi.fn() },
  };
  const deps = {
    react: h.react,
    "../finance/context": { useNativeFinance: () => finance },
    "../finance/errors": errors,
  };
  const read = sourceExports(
    "apps/mobile/src/features/writes/use-fenced-read.ts",
    deps,
  ).useFencedRead as (
    id: string,
    load: (
      finance: unknown,
      householdId: string,
      id: string,
      signal: AbortSignal,
    ) => Promise<unknown>,
  ) => { state: { kind: string }; reload(): void };
  const rows = sourceExports(
    "apps/mobile/src/features/imports/use-import-rows.ts",
    deps,
  ).useImportRows as (
    id: string,
    filter: string,
    offset: number,
    refresh: unknown,
    enabled?: boolean,
  ) => { state: { kind: string; items?: unknown[] }; retry(): void };
  return { h, finance, read, rows };
}

it("reads once per authority, reloads on request and aborts on authority change or unmount", async () => {
  const s = fencedSetup();
  const signals: AbortSignal[] = [];
  const load = (_f: unknown, _h: string, _id: string, signal: AbortSignal) => {
    signals.push(signal);
    return Promise.resolve({ ok: true });
  };
  const render = () => s.h.render(() => s.read("id", load));
  render();
  await flush();
  expect(render().state.kind).toBe("ready");
  render().reload();
  render();
  await flush();
  expect(signals).toHaveLength(2);
  expect(signals[0]?.aborted).toBe(true);
  s.finance.authority = { householdId: "other" };
  render();
  expect(signals[1]?.aborted).toBe(true);
  s.h.unmount();
});

it("reads one bounded page of rows and re-reads only when the page, filter or refresh key changes", async () => {
  const s = fencedSetup();
  s.finance.imports.rows.mockResolvedValue({
    items: [{ rowNumber: 1 }],
    nextOffset: null,
  });
  let filter = "ALL",
    offset = 0,
    refresh: unknown = 5;
  const render = () =>
    s.h.render(() => s.rows(batch.id, filter, offset, refresh));
  render();
  await flush();
  expect(s.finance.imports.rows.mock.calls[0]).toMatchObject([
    householdId,
    batch.id,
    { offset: 0, limit: 25, filter: "ALL" },
    expect.any(AbortSignal),
  ]);
  render();
  expect(s.finance.imports.rows).toHaveBeenCalledOnce();
  filter = "REVIEW";
  render();
  offset = 100;
  render();
  refresh = 6;
  render();
  await flush();
  expect(s.finance.imports.rows).toHaveBeenCalledTimes(4);
  s.h.unmount();
});

it("never publishes a late page after the batch or filter has changed", async () => {
  const s = fencedSetup();
  const first = deferred<{ items: unknown[]; nextOffset: null }>();
  s.finance.imports.rows
    .mockImplementationOnce(() => first.promise)
    .mockResolvedValue({ items: [{ rowNumber: 2 }], nextOffset: null });
  let filter = "ALL";
  const render = () => s.h.render(() => s.rows(batch.id, filter, 0, 1));
  render();
  filter = "REJECTED";
  render();
  await flush();
  first.resolve({ items: [{ rowNumber: 99 }], nextOffset: null });
  await flush();
  expect(render().state.items).toEqual([{ rowNumber: 2 }]);
  s.h.unmount();
});

it("reads no rows until it is enabled, and then reads the first page once", async () => {
  const s = fencedSetup();
  s.finance.imports.rows.mockResolvedValue({ items: [], nextOffset: null });
  let enabled = false;
  const render = () =>
    s.h.render(() => s.rows(batch.id, "REVIEW", 0, null, enabled));
  render();
  await flush();
  expect(s.finance.imports.rows).not.toHaveBeenCalled();
  enabled = true;
  render();
  await flush();
  expect(s.finance.imports.rows).toHaveBeenCalledOnce();
  expect(s.finance.imports.rows.mock.calls[0]?.[2]).toMatchObject({
    filter: "REVIEW",
    limit: 25,
  });
  s.h.unmount();
});

it("drops held rows and stops reading when the gate closes", async () => {
  const s = fencedSetup();
  s.finance.imports.rows.mockResolvedValue({
    items: [{ rowNumber: 1 }],
    nextOffset: null,
  });
  let enabled = true;
  const render = () =>
    s.h.render(() => s.rows(batch.id, "ALL", 0, batch, enabled));
  render();
  await flush();
  expect(render().state.kind).toBe("ready");
  enabled = false;
  render();
  expect(render().state.kind).toBe("loading");
  expect(s.finance.imports.rows).toHaveBeenCalledOnce();
  s.h.unmount();
});
