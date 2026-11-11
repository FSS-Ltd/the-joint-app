import { readFileSync } from "node:fs";
import { expect, it, vi } from "vitest";
import type { TransactionResponse } from "../packages/contracts/src/index.js";
import { elements, press } from "./fixtures/native-source-harness.js";
import { load, text } from "./fixtures/native-read-ui.js";

const householdId = "00000000-0000-4000-8000-000000000001";
const accountId = "e237d3d7-236f-4ec3-8454-c4e5504d397f";
const transactionId = "11111111-1111-4111-8111-111111111111";
const transaction: TransactionResponse = {
  id: transactionId,
  accountId,
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

it("omits empty filters and keeps canonical selector and adapter values", () => {
  const activity = load("activity/activity-query.ts");
  const filters = activity.activityFilters as (draft: {
    month: string;
    search: string;
    classification: string;
    uncategorizedOnly: boolean;
  }) => unknown;
  expect(
    filters({
      month: "",
      search: "   ",
      classification: "ALL",
      uncategorizedOnly: false,
    }),
  ).toEqual({});
  expect(
    filters({
      month: "2026-11",
      search: "  coffee ",
      classification: "EXPENSE",
      uncategorizedOnly: true,
    }),
  ).toEqual({
    month: "2026-11",
    search: "coffee",
    classificationKind: "EXPENSE",
    uncategorized: true,
  });
  const selector = activity.activitySelector as (
    householdId: string,
    accountId: string,
    cursor: string | undefined,
    filters: unknown,
  ) => Record<string, unknown>;
  const selected = selector(householdId, accountId, undefined, {
    month: "2026-11",
    uncategorized: true,
  });
  expect(selected).toEqual({
    kind: "transactions",
    householdId,
    accountId,
    limit: 50,
    month: "2026-11",
    uncategorized: "true",
  });
  const query = activity.activityQuery as (value: unknown) => unknown;
  expect(query(selected)).toEqual({
    accountId,
    limit: 50,
    month: "2026-11",
    uncategorized: true,
  });
  expect(
    selector(householdId, accountId, "opaque-cursor", { search: "coffee" }),
  ).toMatchObject({ cursor: "opaque-cursor", search: "coffee" });
});

it("renders server facts with exact money and opens the detail route", () => {
  const Row = load("activity/transaction-row.tsx").TransactionRow as (props: {
    transaction: TransactionResponse;
    onOpen(id: string): void;
  }) => unknown;
  const onOpen = vi.fn();
  const tree = Row({ transaction, onOpen });
  expect(text(tree)).toContain("Synthetic coffee");
  expect(text(tree)).toContain("2026-11-04");
  expect(text(tree)).toContain("Uncategorised");
  expect(text(tree)).toContain("Unclassified");
  expect(text(tree)).toContain("Entered manually");
  expect(text(tree)).toContain("1.25");
  press(tree, "Open Synthetic coffee");
  expect(onOpen).toHaveBeenCalledWith(transactionId);
});

it("fences malformed and array transaction route ids before mounting a reader", () => {
  const replace = vi.fn();
  for (const value of [undefined, "bad", [transactionId]]) {
    const Route = load("activity/transaction-route.tsx", {
      "expo-router": {
        useLocalSearchParams: () => ({ transactionId: value }),
        useRouter: () => ({ replace }),
      },
      "./transaction-detail-screen": { TransactionDetailScreen: "detail" },
    }).TransactionRoute as () => unknown;
    const tree = Route();
    expect(elements(tree).some((e) => e.type === "detail")).toBe(false);
    press(tree, "Open activity");
  }
  expect(replace.mock.calls).toEqual([
    ["/activity"],
    ["/activity"],
    ["/activity"],
  ]);
  const parse = load("activity/transaction-route.tsx", {
    "expo-router": {
      useLocalSearchParams: () => ({}),
      useRouter: () => ({ replace }),
    },
    "./transaction-detail-screen": { TransactionDetailScreen: "detail" },
  }).parseTransactionRouteId as (value: unknown) => string | null;
  for (const bad of [undefined, "", "bad", [transactionId], null])
    expect(parse(bad)).toBeNull();
  expect(parse(transactionId.toUpperCase())).toBe(transactionId);
});

it("keeps activity screens free of polling and exposes account, filter and paging affordances", () => {
  for (const file of [
    "activity/activity-screen.tsx",
    "activity/activity-page.tsx",
    "activity/transaction-detail-screen.tsx",
    "home/home-activity.tsx",
  ]) {
    const source = readFileSync(`apps/mobile/src/features/${file}`, "utf8");
    expect(source, file).not.toMatch(/setInterval|setTimeout/);
  }
  const page = readFileSync(
    "apps/mobile/src/features/activity/activity-page.tsx",
    "utf8",
  );
  for (const label of [
    "Search transactions",
    "Month filter",
    "Apply activity filters",
    "Clear activity filters",
    "Next activity page",
    "Previous activity page",
  ])
    expect(page, label).toContain(label);
  const screen = readFileSync(
    "apps/mobile/src/features/activity/activity-screen.tsx",
    "utf8",
  );
  expect(screen).toContain('label="Account"');
  expect(
    readFileSync("apps/mobile/src/features/home/home-activity.tsx", "utf8"),
  ).toContain('router.push("/activity")');
});
