import { readFileSync } from "node:fs";
import { expect, it, vi } from "vitest";
import * as contracts from "../packages/contracts/src/index.js";
import * as domain from "../packages/domain/src/cash-flow.js";
import * as labels from "../apps/mobile/src/features/imports/reject-labels.js";
import { effectHarness } from "./fixtures/native-effect-harness.js";
import { load } from "./fixtures/native-read-ui.js";
import {
  byLabel,
  expand,
  press,
  session,
} from "./fixtures/native-activity-ui.js";

const feature = "imports/";
const batch = {
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
  permissions: { canCommit: true },
};
const valid = (rowNumber: number, overrides = {}) => ({
  rowNumber,
  status: "VALID",
  money: { amountMinor: "-1250", currency: "GBP" },
  bookedDate: "2026-11-01",
  description: "Coffee",
  sourceId: null,
  decision: "REVIEW",
  duplicate: false,
  overlaps: [
    {
      transactionId: "22222222-2222-4222-8222-222222222222",
      bookedDate: "2026-11-01",
      money: { amountMinor: "-1250", currency: "GBP" },
      description: "Coffee shop",
    },
  ],
  ...overrides,
});
const rejected = (rowNumber: number) => ({
  rowNumber,
  status: "REJECTED",
  reason: "INVALID_DATE",
});

function card(row: unknown, choice?: "KEEP" | "SKIP") {
  const onChoose = vi.fn();
  const tree = (
    load(`${feature}import-row-card.tsx`, {
      "react-native": { View: "view" },
      "@/theme/tokens": {
        colors: { border: "#ccc" },
        corners: { surface: 6 },
        spacing: { small: 8, medium: 16 },
      },
      "../accounts/account-choice": { AccountChoice: "choice" },
      "./reject-labels": labels,
    }).ImportRowCard as (props: unknown) => unknown
  )({ row, editable: true, choice, onChoose });
  return { tree, onChoose };
}

it("row card shows a rejected row's reason and never offers a decision for it", () => {
  const { tree } = card(rejected(4));
  const text = JSON.stringify(expand(tree));
  expect(text).toContain("Row 4: rejected");
  expect(text).toContain(labels.rejectLabels.INVALID_DATE);
  expect(byLabel(tree, "Decision for row 4")).toBeUndefined();
});

it("row card lists overlaps, starts undecided, ignores 'Decide' and records Keep or Skip", () => {
  const { tree, onChoose } = card(valid(7));
  const text = JSON.stringify(expand(tree));
  expect(text).toContain("Possible overlap");
  expect(text).toContain("Coffee shop");
  const picker = byLabel(tree, "Decision for row 7");
  expect(picker?.value).toBe("");
  expect(picker?.options).toEqual(["", "KEEP", "SKIP"]);
  (picker?.onChange as (value: string) => void)("");
  expect(onChoose).not.toHaveBeenCalled();
  (picker?.onChange as (value: string) => void)("SKIP");
  expect(onChoose).toHaveBeenCalledWith("SKIP");
  expect(
    byLabel(card(valid(7), "KEEP").tree, "Decision for row 7")?.value,
  ).toBe("KEEP");
  expect(
    byLabel(card(valid(7, { decision: "SKIP" })).tree, "Decision for row 7")
      ?.value,
  ).toBe("SKIP");
});

it("row card explains a duplicate is skipped and offers no decision", () => {
  const { tree } = card(valid(9, { duplicate: true, overlaps: [] }));
  expect(JSON.stringify(expand(tree))).toContain("This row is skipped");
  expect(byLabel(tree, "Decision for row 9")).toBeUndefined();
});

function review(
  rowsState: unknown,
  choices: Record<number, string> = {},
  overrides: Record<string, unknown> = {},
  batchOverrides: Record<string, unknown> = {},
) {
  const state = session(
    { ...batch, ...batchOverrides },
    { choices },
    overrides,
  );
  const retry = vi.fn();
  const rowsCalls: unknown[][] = [];
  const tree = (
    load(`${feature}import-review-screen.tsx`, {
      react: { useState: (initial: unknown) => [initial, vi.fn()] },
      "../accounts/account-choice": { AccountChoice: "choice" },
      "./import-batch-boundary": { ImportBatchBoundary: "boundary" },
      "./import-row-card": { ImportRowCard: "card" },
      "./use-import-review": { useImportReviewWrite: () => state },
      "./use-import-rows": {
        importRowsPage: 25,
        useImportRows: (...args: unknown[]) => {
          rowsCalls.push(args);
          return { state: rowsState, retry };
        },
      },
    }).ImportReviewScreen as (props: { batchId: string }) => unknown
  )({ batchId: batch.id });
  return { state, tree, retry, rowsCalls };
}
const page = (items: unknown[], nextOffset: number | null = null) => ({
  kind: "ready",
  items,
  nextOffset,
});

it("review screen saves only after a choice and locks paging and the filter until then", () => {
  const clean = review(page([valid(1)], 100));
  expect(byLabel(clean.tree, "Save decisions")?.disabled).toBe(true);
  expect(byLabel(clean.tree, "Show rows")?.disabled).toBe(false);
  expect(byLabel(clean.tree, "Next rows")?.disabled).toBe(false);
  const dirty = review(page([valid(1)], 100), { 1: "KEEP" });
  expect(byLabel(dirty.tree, "Save decisions")?.disabled).toBe(false);
  expect(byLabel(dirty.tree, "Show rows")?.disabled).toBe(true);
  expect(byLabel(dirty.tree, "Next rows")?.disabled).toBe(true);
  press(dirty.tree, "Save decisions");
  expect(dirty.state.submit).toHaveBeenCalledOnce();
  expect(JSON.stringify(expand(dirty.tree))).toContain("Save your choices");
});

it("review screen opens on the rows needing a decision and enables the read only for a visible, live draft", () => {
  const overlaps = review(page([]), {}, {}, { overlapRows: 3 });
  expect(overlaps.rowsCalls[0]?.slice(1, 3)).toEqual(["REVIEW", 0]);
  expect(overlaps.rowsCalls[0]?.[4]).toBe(true);
  const none = review(page([]));
  expect(none.rowsCalls[0]?.slice(1, 3)).toEqual(["ALL", 0]);
  const hidden = session(batch, { choices: {} });
  hidden.draft.visible = false;
  const gated = review(page([]), {}, hidden);
  expect(gated.rowsCalls[0]?.[4]).toBe(false);
});

it("review screen merges each choice into the draft and shows loading, empty and error states", () => {
  const live = review(page([valid(2)]), { 1: "KEEP" });
  const cardProps = expand(live.tree).find((e) => e.type === "card")?.props;
  (cardProps?.onChoose as (value: string) => void)("SKIP");
  expect(live.state.draft.change).toHaveBeenCalledWith({
    choices: { 1: "KEEP", 2: "SKIP" },
  });
  expect(JSON.stringify(expand(review({ kind: "loading" }).tree))).toContain(
    "Loading rows",
  );
  expect(JSON.stringify(expand(review(page([])).tree))).toContain(
    "No rows in this view",
  );
  const failed = review({ kind: "error", message: "x" });
  press(failed.tree, "Reload rows");
  expect(failed.retry).toHaveBeenCalledOnce();
});

function commit(overrides: Record<string, unknown> = {}, acknowledged = false) {
  const push = vi.fn();
  const state = session({ ...batch, ...overrides }, { acknowledged });
  const tree = (
    load(`${feature}import-commit-screen.tsx`, {
      "@expo/ui": { Host: "host", Switch: "switch" },
      "expo-router": { useRouter: () => ({ push }) },
      "./import-batch-boundary": { ImportBatchBoundary: "boundary" },
      "./use-import-review": { useImportCommitWrite: () => state },
    }).ImportCommitScreen as (props: { batchId: string }) => unknown
  )({ batchId: batch.id });
  return { state, tree, push };
}

it("commit screen blocks on undecided overlaps and points to the review", () => {
  const blocked = commit({ overlapRows: 2 });
  expect(byLabel(blocked.tree, "Commit import")?.disabled).toBe(true);
  expect(byLabel(blocked.tree, "Review rows")).toBeDefined();
});

it("commit screen requires acknowledging rejected rows and then commits through the session", () => {
  const unacknowledged = commit({ rejectedRows: 3 });
  const toggle = expand(unacknowledged.tree).find((e) => e.type === "switch");
  expect(toggle?.props.label).toContain("3 rejected rows");
  expect(byLabel(unacknowledged.tree, "Commit import")?.disabled).toBe(true);
  (toggle?.props.onValueChange as (value: boolean) => void)(true);
  expect(unacknowledged.state.draft.change).toHaveBeenCalledWith({
    acknowledged: true,
  });
  const ready = commit({ rejectedRows: 3 }, true);
  expect(byLabel(ready.tree, "Commit import")?.disabled).toBe(false);
  press(ready.tree, "Commit import");
  expect(ready.state.submit).toHaveBeenCalledOnce();
  const clean = commit();
  expect(expand(clean.tree).some((e) => e.type === "switch")).toBe(false);
  expect(byLabel(clean.tree, "Commit import")?.disabled).toBe(false);
});

it("commit screen explains and blocks an import with no valid rows", () => {
  const none = commit({ validRows: 0, rejectedRows: 0 });
  expect(JSON.stringify(expand(none.tree))).toContain("no valid rows");
  expect(byLabel(none.tree, "Commit import")?.disabled).toBe(true);
});

it("commit screen replaces itself with the review so back never shows stale counts", () => {
  const replace = vi.fn();
  const state = session({ ...batch, overlapRows: 1 }, { acknowledged: false });
  const tree = (
    load(`${feature}import-commit-screen.tsx`, {
      "@expo/ui": { Host: "host", Switch: "switch" },
      "expo-router": { useRouter: () => ({ replace, push: vi.fn() }) },
      "./import-batch-boundary": { ImportBatchBoundary: "boundary" },
      "./use-import-review": { useImportCommitWrite: () => state },
    }).ImportCommitScreen as (props: { batchId: string }) => unknown
  )({ batchId: batch.id });
  press(tree, "Review rows");
  expect(replace).toHaveBeenCalledWith(`/imports/${batch.id}/review`);
});

function batchScreen(value: Record<string, unknown>) {
  const push = vi.fn();
  const tree = (
    load(`${feature}import-batch-screen.tsx`, {
      "expo-router": { useRouter: () => ({ replace: vi.fn(), push }) },
      "./use-import-batch": {
        useImportBatch: () => ({
          kind: "ready",
          value: {
            ...batch,
            failureCode: null,
            originalAvailable: true,
            ...value,
          },
          retry: vi.fn(),
        }),
      },
    }).ImportBatchScreen as (props: { batchId: string }) => unknown
  )({ batchId: batch.id });
  return { tree, push };
}

it("batch screen offers review and commit only for a READY batch the caller may commit", () => {
  const ready = batchScreen({});
  press(ready.tree, "Review rows");
  press(ready.tree, "Commit import");
  expect(ready.push.mock.calls).toEqual([
    [`/imports/${batch.id}/review`],
    [`/imports/${batch.id}/commit`],
  ]);
  for (const other of [
    { state: "COMMITTING" },
    { state: "COMMITTED" },
    { permissions: { canCommit: false } },
  ])
    expect(byLabel(batchScreen(other).tree, "Review rows")).toBeUndefined();
});

it("wires the batch folder routes, stack screens and shared boundary without polling", () => {
  const root = "apps/mobile";
  for (const [file, screen] of [
    ["[batchId]/index.tsx", "ImportBatchRoute"],
    ["[batchId]/review.tsx", "ImportReviewScreen"],
    ["[batchId]/commit.tsx", "ImportCommitScreen"],
  ] as const)
    expect(
      readFileSync(`${root}/app/(workspace)/imports/${file}`, "utf8"),
      file,
    ).toContain(screen);
  const layout = readFileSync(
    `${root}/app/(workspace)/imports/_layout.tsx`,
    "utf8",
  );
  for (const name of [
    "[batchId]/index",
    "[batchId]/review",
    "[batchId]/commit",
  ])
    expect(layout, name).toContain(name);
  for (const file of [
    "import-review-screen.tsx",
    "import-commit-screen.tsx",
    "use-import-rows.ts",
    "use-import-review.ts",
  ])
    expect(
      readFileSync(`${root}/src/features/imports/${file}`, "utf8"),
      file,
    ).not.toMatch(/setInterval|setTimeout/);
  void contracts;
  void domain;
});

function pagedScreen(batchState: { overlapRows: number }) {
  const h = effectHarness();
  const state = session({ ...batch, ...batchState }, { choices: {} });
  const calls: unknown[][] = [];
  const Screen = load(`${feature}import-review-screen.tsx`, {
    react: h.react,
    "../accounts/account-choice": { AccountChoice: "choice" },
    "./import-batch-boundary": { ImportBatchBoundary: "boundary" },
    "./import-row-card": { ImportRowCard: "card" },
    "./use-import-review": { useImportReviewWrite: () => state },
    "./use-import-rows": {
      importRowsPage: 25,
      useImportRows: (...args: unknown[]) => {
        calls.push(args);
        return { state: page([valid(1)], 25), retry: vi.fn() };
      },
    },
  }).ImportReviewScreen as (props: { batchId: string }) => unknown;
  const render = () => h.render(() => Screen({ batchId: batch.id }));
  return { state, calls, render };
}

it("review screen pages by 25, goes back, and resets the page when the filter changes", () => {
  const s = pagedScreen({ overlapRows: 0 });
  press(s.render(), "Next rows");
  s.render();
  expect(s.calls.at(-1)?.slice(1, 3)).toEqual(["ALL", 25]);
  press(s.render(), "Previous rows");
  s.render();
  expect(s.calls.at(-1)?.slice(1, 3)).toEqual(["ALL", 0]);
  press(s.render(), "Next rows");
  const filter = byLabel(s.render(), "Show rows")?.onChange as (
    value: string,
  ) => void;
  filter("REJECTED");
  s.render();
  expect(s.calls.at(-1)?.slice(1, 3)).toEqual(["REJECTED", 0]);
});

it("review screen does not carry a page over when the derived filter changes", () => {
  const s = pagedScreen({ overlapRows: 3 });
  press(s.render(), "Next rows");
  s.render();
  expect(s.calls.at(-1)?.slice(1, 3)).toEqual(["REVIEW", 25]);
  // The last overlap was decided and the batch re-read: the derived filter becomes ALL.
  s.state.draft.base = { ...batch, overlapRows: 0 } as never;
  s.render();
  expect(s.calls.at(-1)?.slice(1, 3)).toEqual(["ALL", 0]);
});
