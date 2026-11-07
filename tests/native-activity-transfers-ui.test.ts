import { readFileSync } from "node:fs";
import { expect, it, vi } from "vitest";
import * as contracts from "../packages/contracts/src/index.js";
import * as domain from "../packages/domain/src/cash-flow.js";
import { load } from "./fixtures/native-read-ui.js";
import {
  byLabel,
  expand,
  press,
  session,
} from "./fixtures/native-activity-ui.js";

const out: contracts.TransactionResponse = {
  id: "11111111-1111-4111-8111-111111111111",
  accountId: "e237d3d7-236f-4ec3-8454-c4e5504d397f",
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
const into: contracts.TransactionResponse = {
  ...out,
  id: "22222222-2222-4222-8222-222222222222",
  accountId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  money: { amountMinor: "5000", currency: "GBP" },
  description: "In",
  version: 7,
};
const found = (overrides: Record<string, unknown> = {}) => ({
  accounts: {
    kind: "ready",
    items: [{ id: into.accountId, label: "Savings" }],
    cursor: null,
  },
  accountId: "",
  choose: vi.fn(),
  entries: { kind: "ready", items: [into], cursor: null },
  loadMore: vi.fn(),
  moreLoading: false,
  retry: vi.fn(),
  retryEntries: vi.fn(),
  ...overrides,
});
function link(
  candidates: ReturnType<typeof found>,
  counterpart: contracts.TransactionResponse | null = null,
  overrides: Record<string, unknown> = {},
) {
  const state = session(out, { counterpart }, overrides);
  const tree = (
    load("activity/transfer-screen.tsx", {
      "@joint/domain/cash-flow": domain,
      "../accounts/account-choice": { AccountChoice: "choice" },
      "./transaction-write-boundary": { TransactionWriteBoundary: "boundary" },
      "./use-transfer-candidates": { useTransferCandidates: () => candidates },
      "./use-transfer-write": { useTransferLinkWrite: () => state },
    }).TransferScreen as (props: { transactionId: string }) => unknown
  )({ transactionId: out.id });
  return { state, tree };
}

it("choosing another account clears any picked entry, and choosing an entry stores the whole row", () => {
  const candidates = found({ accountId: into.accountId });
  const { state, tree } = link(candidates);
  (byLabel(tree, "Other account")?.onChange as (id: string) => void)(
    into.accountId,
  );
  expect(candidates.choose).toHaveBeenCalledWith(into.accountId);
  expect(state.draft.change).toHaveBeenCalledWith({ counterpart: null });
  (byLabel(tree, "Matching entry")?.onChange as (id: string) => void)(into.id);
  expect(state.draft.change).toHaveBeenCalledWith({ counterpart: into });
});

it("confirm stays disabled until an entry is chosen, then submits through the session", () => {
  const empty = link(found({ accountId: into.accountId }));
  expect(byLabel(empty.tree, "Confirm transfer pair")?.disabled).toBe(true);
  const chosen = link(found({ accountId: into.accountId }), into);
  expect(byLabel(chosen.tree, "Confirm transfer pair")?.disabled).toBe(false);
  press(chosen.tree, "Confirm transfer pair");
  expect(chosen.state.submit).toHaveBeenCalledOnce();
});

it("labels entries with date, description and exact amount, and says when none match", () => {
  const withEntries = link(found({ accountId: into.accountId }));
  expect(
    JSON.stringify(byLabel(withEntries.tree, "Matching entry")?.labels),
  ).toContain("2026-11-04 · In · £50.00");
  const none = link(
    found({
      accountId: into.accountId,
      entries: { kind: "ready", items: [], cursor: "next" },
    }),
  );
  expect(byLabel(none.tree, "Matching entry")).toBeUndefined();
  expect(JSON.stringify(expand(none.tree))).toContain("No matching entries");
  press(none.tree, "Load more matching activity");
});

it("explains when there is no other owned account, loading and failure states, and the 50 account limit", () => {
  const noAccounts = link(
    found({ accounts: { kind: "ready", items: [], cursor: null } }),
  );
  expect(JSON.stringify(expand(noAccounts.tree))).toContain(
    "another account that you own",
  );
  const failed = found({ accounts: { kind: "error", message: "x" } });
  press(link(failed).tree, "Retry accounts");
  expect(failed.retry).toHaveBeenCalledOnce();
  const limited = link(
    found({
      accounts: {
        kind: "ready",
        items: [{ id: into.accountId, label: "Savings" }],
        cursor: "more",
      },
    }),
  );
  expect(JSON.stringify(expand(limited.tree))).toContain("first 50 accounts");
});

it("keeps a picked entry in the picker after a refresh drops it, and retries only the entries", () => {
  const refreshed = found({
    accountId: into.accountId,
    entries: { kind: "ready", items: [], cursor: null },
  });
  const kept = link(refreshed, into);
  expect(byLabel(kept.tree, "Matching entry")?.options).toEqual(["", into.id]);
  const failed = found({
    accountId: into.accountId,
    entries: { kind: "error", message: "x" },
  });
  press(link(failed).tree, "Retry entries");
  expect(failed.retryEntries).toHaveBeenCalledOnce();
  expect(failed.retry).not.toHaveBeenCalled();
});

const linked = (tx: contracts.TransactionResponse) => ({
  ...tx,
  transfer: {
    confirmed: true,
    id: "33333333-3333-4333-8333-333333333333",
    canRemove: true,
  },
});
function remove(state: unknown) {
  const base = linked(out);
  const sessionState = session(base, { pair: null });
  const tree = (
    load("activity/remove-transfer-screen.tsx", {
      "@joint/domain/cash-flow": domain,
      "./transaction-write-boundary": { TransactionWriteBoundary: "boundary" },
      "./use-transfer-pair": {
        useTransferPair: () => ({ state, reload: vi.fn() }),
      },
      "./use-transfer-write": { useTransferRemoveWrite: () => sessionState },
    }).RemoveTransferScreen as (props: { transactionId: string }) => unknown
  )({ transactionId: out.id });
  return { sessionState, tree };
}

it("removal waits for the pair, shows both legs, and submits that exact pair explicitly", () => {
  const loading = remove({ kind: "loading" });
  expect(byLabel(loading.tree, "Remove transfer pair")?.disabled).toBe(true);
  const pair = {
    id: "33333333-3333-4333-8333-333333333333",
    from: linked(out),
    to: linked(into),
  };
  const ready = remove({ kind: "ready", value: pair });
  expect(JSON.stringify(expand(ready.tree))).toContain("Out");
  press(ready.tree, "Remove transfer pair");
  expect(ready.sessionState.submit).toHaveBeenCalledWith({ pair });
  const failed = remove({ kind: "error", message: "x" });
  expect(byLabel(failed.tree, "Retry pair")).toBeDefined();
  expect(byLabel(failed.tree, "Remove transfer pair")?.disabled).toBe(true);
});

it("wires detail entries, thin routes and stack screens without polling", () => {
  const root = "apps/mobile";
  const detail = readFileSync(
    `${root}/src/features/activity/transaction-detail-screen.tsx`,
    "utf8",
  );
  for (const label of ["Link a transfer", "Remove transfer pair"])
    expect(detail).toContain(label);
  for (const [route, screen] of [
    ["transfer", "TransferScreen"],
    ["remove-transfer", "RemoveTransferScreen"],
  ] as const) {
    expect(
      readFileSync(
        `${root}/app/(workspace)/activity/[transactionId]/${route}.tsx`,
        "utf8",
      ),
    ).toContain(`screen={${screen}}`);
    expect(
      readFileSync(`${root}/app/(workspace)/activity/_layout.tsx`, "utf8"),
    ).toContain(`[transactionId]/${route}`);
  }
  for (const file of [
    "transfer-screen.tsx",
    "remove-transfer-screen.tsx",
    "use-transfer-candidates.ts",
    "use-transfer-pair.ts",
    "use-transfer-write.ts",
  ])
    expect(
      readFileSync(`${root}/src/features/activity/${file}`, "utf8"),
    ).not.toMatch(/setInterval|setTimeout/);
});
