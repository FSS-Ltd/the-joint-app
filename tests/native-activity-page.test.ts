import { readFileSync } from "node:fs";
import { expect, it, vi } from "vitest";
import type {
  AccountResponse,
  TransactionResponse,
} from "../packages/contracts/src/index.js";
import * as accountLabels from "../apps/mobile/src/features/accounts/account-labels.js";
import { financeAuthorityKey } from "../apps/mobile/src/features/finance/scope.js";
import type { ActivityFilterDraft } from "../apps/mobile/src/features/activity/activity-query.js";
import {
  elements,
  hookHarness,
  press,
} from "./fixtures/native-source-harness.js";
import { account, load, text } from "./fixtures/native-read-ui.js";

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
  const Row = load("activity/transaction-row.tsx", {
    "react-native": {
      View: "view",
      Pressable: "pressable",
      StyleSheet: { create: <T>(styles: T) => styles },
      useWindowDimensions: () => ({ width: 320, fontScale: 1.6 }),
    },
  }).TransactionRow as (props: {
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
  const [action] = elements(tree);
  expect(action?.props.accessibilityRole).toBe("button");
  expect(action?.props.accessibilityLabel).toEqual(
    expect.stringContaining("Open Synthetic coffee"),
  );
  expect(text(tree)).toContain('"flexDirection":"column"');
  expect(typeof action?.props.onPress).toBe("function");
  if (typeof action?.props.onPress === "function") action.props.onPress();
  expect(onOpen).toHaveBeenCalledWith(transactionId);
});

it("shows only transaction-visible accounts and keeps CSV review to owners", () => {
  const h = hookHarness();
  const totals = account({
    id: accountId,
    access: "TOTALS",
    ownership: "SHARED",
    sharing: null,
  });
  const owned = account();
  let items = [totals, owned];
  const push = vi.fn();
  const Screen = load("activity/activity-screen.tsx", {
    react: h.react,
    "expo-router": { useRouter: () => ({ push }) },
    "../accounts/account-choice": { AccountChoice: "choice" },
    "../finance/context": {
      useNativeFinance: () => ({ authority: { householdId } }),
    },
    "../finance/use-resource": {
      useFinanceResource: () => ({
        kind: "ready",
        value: { items, nextCursor: null },
      }),
    },
    "./activity-page": { ActivityPage: "activity-page" },
  }).ActivityScreen as () => unknown;
  const render = () => h.render(Screen);
  const page = () =>
    elements(render()).find((item) => item.type === "activity-page");
  expect(page()?.props.account).toBe(owned);
  const reviewImports = page()?.props.onReviewImports;
  expect(typeof reviewImports).toBe("function");
  if (typeof reviewImports === "function") reviewImports();
  expect(push).toHaveBeenCalledWith(`/imports/history/${owned.id}`);
  items = [totals, account({ ownership: "SHARED", sharing: null })];
  expect(page()?.props.onReviewImports).toBeUndefined();
  items = [totals];
  expect(page()).toBeUndefined();
  expect(text(render())).toContain("No transaction access");
});

it("applies search and advanced filters independently on the authorized page", () => {
  const h = hookHarness();
  const result = {
    kind: "ready",
    value: { items: [transaction], nextCursor: null },
  };
  const subscribe = vi.fn<(selector: unknown) => typeof result>(() => result);
  const Page = load("activity/activity-page.tsx", {
    react: h.react,
    "../accounts/account-labels": accountLabels,
    "../finance/context": { useNativeFinance: () => ({ authority: null }) },
    "../finance/scope": { financeAuthorityKey },
    "../finance/use-resource": { useFinanceResource: subscribe },
    "./activity-query": load("activity/activity-query.ts"),
    "./transaction-row": { TransactionRow: "transaction" },
    "./activity-filter-controls": { ActivityFilterControls: "filter-controls" },
  }).ActivityPage as (props: {
    account: AccountResponse;
    onOpen(): void;
  }) => unknown;
  const render = () =>
    h.render(() => Page({ account: account(), onOpen: vi.fn() }));
  const form = hookHarness();
  const Controls = load("activity/activity-filter-controls.tsx", {
    react: form.react,
    "@expo/ui": { Host: "host", Switch: "switch" },
    "@/components/native-field": { NativeField: "field" },
    "../accounts/account-choice": { AccountChoice: "choice" },
    "./activity-query": load("activity/activity-query.ts"),
  }).ActivityFilterControls as (props: {
    applied: ActivityFilterDraft;
    filterCount: number;
    onChange(next: ActivityFilterDraft): void;
  }) => unknown;
  const header = () => {
    const node = elements(
      elements(render())[0]?.props.ListHeaderComponent,
    ).find((element) => element.type === "filter-controls");
    if (!node) throw new Error("Missing activity controls");
    return form.render(() =>
      Controls(node.props as Parameters<typeof Controls>[0]),
    );
  };
  const setField = (label: string, value: string) => {
    const change = elements(header()).find((node) => node.props.label === label)
      ?.props.onChangeText;
    if (typeof change !== "function") throw new Error(`Missing ${label}`);
    change(value);
  };
  const selector = () => subscribe.mock.lastCall?.[0];
  expect(text(header())).not.toContain("Month filter");
  press(header(), "Filters");
  setField("Month filter", "2026-09");
  setField("Search transactions", "  coffee  ");
  const submitSearch = elements(header()).find(
    (node) => node.props.label === "Search transactions",
  )?.props.onSubmitEditing;
  if (typeof submitSearch !== "function")
    throw new Error("Missing search action");
  submitSearch();
  header();
  expect(selector()).toMatchObject({ search: "coffee" });
  expect(selector()).not.toHaveProperty("month");
  press(header(), "Apply activity filters");
  expect(text(header())).not.toContain("Month filter");
  expect(selector()).toMatchObject({ month: "2026-09", search: "coffee" });
  press(header(), "Clear search");
  header();
  expect(selector()).toMatchObject({ month: "2026-09" });
  expect(selector()).not.toHaveProperty("search");
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
  const controls = readFileSync(
    "apps/mobile/src/features/activity/activity-filter-controls.tsx",
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
    expect(page + controls, label).toContain(label);
  const screen = readFileSync(
    "apps/mobile/src/features/activity/activity-screen.tsx",
    "utf8",
  );
  expect(screen).toContain('label="Account"');
  expect(
    readFileSync("apps/mobile/src/features/home/home-activity.tsx", "utf8"),
  ).toContain('router.push("/activity")');
});
