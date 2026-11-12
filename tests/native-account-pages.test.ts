import { expect, it, vi } from "vitest";
import type { AccountResponse } from "../packages/contracts/src/index.js";
import type { NativeResourceScope } from "../apps/mobile/src/events/scope.js";
import type { NativeFinanceAuthority } from "../apps/mobile/src/features/finance/scope.js";
import { financeAuthorityKey } from "../apps/mobile/src/features/finance/scope.js";
import { scope } from "./fixtures/native-stream.js";
import { account, id, load } from "./fixtures/native-read-ui.js";
import * as accountLabels from "../apps/mobile/src/features/accounts/account-labels.js";
import {
  elements,
  hookHarness,
  press,
} from "./fixtures/native-source-harness.js";

type Page = { items: AccountResponse[]; nextCursor: string | null };

it("reads only captured page parameters, replaces page data, and resets the actual cursor", async () => {
  const h = hookHarness();
  const list = vi.fn(async () => ({ items: [], nextCursor: null }));
  let finance = {
    authority: scope as NativeFinanceAuthority,
    accounts: { list },
    isCurrent: () => true,
  };
  let requested: NativeResourceScope["selector"];
  let read: (
    captured: NativeResourceScope,
    signal: AbortSignal,
  ) => Promise<Page>;
  let value: Page = { items: [account()], nextCursor: "issued-page-two" };
  const usePage = load("accounts/use-account-page.ts", {
    react: h.react,
    "../finance/context": { useNativeFinance: () => finance },
    "../finance/scope": { financeAuthorityKey },
    "../finance/use-resource": {
      useFinanceResource: (
        selector: NativeResourceScope["selector"],
        reader: typeof read,
      ) => {
        requested = selector;
        read = reader;
        return { kind: "ready", value, retry: vi.fn() };
      },
    },
  }).useAccountPage as () => {
    resource: { value: Page };
    next(): void;
    previous(): void;
    reset(): void;
    firstPage: boolean;
  };
  const render = () => h.render(usePage);
  render();
  expect(requested!).toEqual({
    kind: "accounts",
    householdId: scope.householdId,
    limit: 50,
  });
  const signal = new AbortController().signal;
  await read!(
    {
      ...scope,
      selector: {
        kind: "accounts",
        householdId: scope.householdId,
        limit: 50,
        cursor: "captured-cursor",
      },
    },
    signal,
  );
  expect(list).toHaveBeenCalledExactlyOnceWith(
    scope.householdId,
    { limit: 50, cursor: "captured-cursor" },
    signal,
  );
  render().next();
  render();
  expect(requested!).toMatchObject({ cursor: "issued-page-two" });
  expect(render()).toHaveProperty("previous", expect.any(Function));
  render().previous();
  render();
  expect(requested!).not.toHaveProperty("cursor");
  render().next();
  render();
  value = { items: [account()], nextCursor: "issued-page-three" };
  render().next();
  render();
  expect(requested!).toMatchObject({ cursor: "issued-page-three" });
  render().previous();
  render();
  expect(requested!).toMatchObject({ cursor: "issued-page-two" });
  value = {
    items: [account({ id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" })],
    nextCursor: null,
  };
  expect(render().resource.value.items.map((a) => a.id)).toEqual([
    "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  ]);
  render().reset();
  render();
  expect(requested!).not.toHaveProperty("cursor");
  value = { items: [], nextCursor: "issued-again" };
  render().next();
  render();
  finance.authority = { ...scope, grantVersion: 1 };
  render();
  expect(requested!).not.toHaveProperty("cursor");
  render().next();
  render();
  finance = { ...finance };
  render();
  expect(requested!).not.toHaveProperty("cursor");
});

it("renders one FlatList with stable keys, live replacement, empty/error and deliberate recovery controls", () => {
  let result:
    | { kind: "ready"; value: Page }
    | { kind: "loading" }
    | { kind: "error"; message: string } = {
    kind: "ready",
    value: { items: [account()], nextCursor: "issued" },
  };
  const reset = vi.fn(),
    retry = vi.fn(),
    next = vi.fn(),
    previous = vi.fn();
  const Page = load("accounts/account-page.tsx", {
    "./use-account-page": {
      useAccountPage: () => ({
        resource: { ...result, retry },
        firstPage: false,
        canGoBack: true,
        reset,
        previous,
        next,
      }),
    },
  }).AccountPage as (props: {
    renderAccount(a: AccountResponse): never;
  }) => unknown;
  const render = () =>
    elements(
      Page({
        renderAccount: () => {
          throw Error("not needed");
        },
      }),
    )[0]!;
  let tree = render();
  expect(tree.type).toBe("list");
  const key = tree.props.keyExtractor as (a: AccountResponse) => string;
  expect(key(account())).toBe(id);
  expect(tree.props.data).toEqual([account()]);
  press(tree.props.ListFooterComponent, "Previous account page");
  expect(previous).toHaveBeenCalledOnce();
  result = { kind: "ready", value: { items: [], nextCursor: null } };
  expect(render().props.data).toEqual([]);
  expect(
    (render().props.ListEmptyComponent as { props: { title: string } }).props
      .title,
  ).toBe("No accounts on this page");
  result = { kind: "loading" };
  expect(render().props.data).toEqual([]);
  result = {
    kind: "error",
    message: "This page is no longer authorized. Return to the first page.",
  };
  tree = render();
  expect(tree.props.data).toEqual([]);
  press(tree.props.ListEmptyComponent, "Retry accounts");
  press(tree.props.ListEmptyComponent, "Return to first account page");
  expect(retry).toHaveBeenCalledOnce();
  expect(reset).toHaveBeenCalledOnce();
});

it("keeps Screen scrolling by default and puts virtualized pages in its non-scroll body", () => {
  const Screen = loadScreen();
  const regular = elements(Screen({ children: "content" }));
  expect(regular.some((e) => e.type === "scroll")).toBe(true);
  const fixed = elements(Screen({ scrollable: false, children: "content" }));
  expect(fixed.some((e) => e.type === "scroll")).toBe(false);
  const push = vi.fn();
  const List = load("accounts/list-screen.tsx", {
    "expo-router": { useRouter: () => ({ push }) },
    "./account-page": { AccountPage: "page" },
    "./account-row": { AccountRow: "row" },
    "../home/summary-view": { SummaryView: "summary" },
  }).AccountListScreen as () => unknown;
  const tree = List();
  expect(elements(tree)[0]?.props.scrollable).toBe(false);
  expect(elements(tree).find((e) => e.type === "summary")?.props.scope).toEqual(
    { kind: "visible" },
  );
  press(tree, "Add account");
  press(tree, "Import CSV");
  expect(push.mock.calls).toEqual([["/home/accounts/new"], ["/imports"]]);
});

it("opens the first account form from the empty first page", () => {
  const onAddAccount = vi.fn();
  const Page = load("accounts/account-page.tsx", {
    "./use-account-page": {
      useAccountPage: () => ({
        resource: { kind: "ready", value: { items: [], nextCursor: null } },
        firstPage: true,
      }),
    },
  }).AccountPage as (props: {
    renderAccount(a: AccountResponse): never;
    onAddAccount(): void;
  }) => unknown;
  const [list] = elements(
    Page({
      renderAccount: () => {
        throw Error("No accounts expected");
      },
      onAddAccount,
    }),
  );
  expect(elements(list?.props.ListEmptyComponent)[0]?.props.title).toBe(
    "No accounts yet",
  );
  press(list?.props.ListEmptyComponent, "Add your first account");
  expect(onAddAccount).toHaveBeenCalledOnce();
});

it("keeps an account row actionable with its real ownership and valuation labels", () => {
  const onOpen = vi.fn();
  const Row = load("accounts/account-row.tsx", {
    "./account-labels": accountLabels,
    "./imported-balance": { ImportedBalance: "imported-balance" },
    "react-native": {
      Pressable: "pressable",
      View: "view",
      StyleSheet: { create: <T>(styles: T) => styles },
      useWindowDimensions: () => ({ width: 320, fontScale: 1.6 }),
    },
  }).AccountRow as (props: {
    account: AccountResponse;
    onOpen(): void;
  }) => unknown;
  const row = Row({ account: account(), onOpen });
  const [action] = elements(row);
  expect(action?.props.accessibilityRole).toBe("button");
  expect(action?.props.onPress).toBe(onOpen);
  expect(JSON.stringify(row)).toContain("Sole owner: you");
  expect(JSON.stringify(row)).toContain("Private");
  expect(JSON.stringify(row)).toContain("No valuation recorded");
  expect(JSON.stringify(row)).toContain('"flexDirection":"column"');
  expect(JSON.stringify(row)).toContain("Available");
  const valuation = {
    id,
    money: { amountMinor: "82000", currency: "GBP" as const },
    adultMoney: { amountMinor: "40000", currency: "GBP" as const },
    asOfDate: "2026-11-10",
    recordedAt: "2026-11-10T12:00:00.000Z",
    complete: false,
    source: "MANUAL" as const,
  };
  const owned = account({
    legalOwnerKind: "JOINT_ADULT",
    latestValuation: valuation,
  });
  expect(JSON.stringify(Row({ account: owned, onOpen }))).toContain(
    "Adult portion: £400.00",
  );
  expect(JSON.stringify(Row({ account: owned, onOpen }))).toContain("£820.00");
  const unknown = account({
    latestValuation: { ...valuation, adultMoney: null },
  });
  expect(JSON.stringify(Row({ account: unknown, onOpen }))).toContain(
    "Adult portion unknown",
  );
});

function loadScreen() {
  return sourceExports("apps/mobile/src/components/screen.tsx", {
    "react/jsx-runtime": jsxBoundary,
    "react-native": {
      View: "view",
      ScrollView: "scroll",
      StyleSheet: { create: <T>(s: T) => s },
      useWindowDimensions: () => ({ width: 320 }),
    },
    "react-native-safe-area-context": { SafeAreaView: "safe" },
    "@/theme/tokens": { colors: {}, spacing: {} },
  }).Screen as (props: { scrollable?: boolean; children: unknown }) => unknown;
}
import {
  jsxBoundary,
  sourceExports,
} from "./fixtures/native-source-harness.js";

it("reads one balance batch for the visible account page and never batches the summary picker", async () => {
  const h = hookHarness();
  const rows = [
    account(),
    account({ id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" }),
  ];
  const list = vi.fn(async () => ({ items: rows, nextCursor: null }));
  const currentBalances = vi.fn(async () => ({
    items: rows.map((row) => ({ accountId: row.id, status: "NO_ACTIVITY" })),
  }));
  let read:
    | ((scope: NativeResourceScope, signal: AbortSignal) => Promise<unknown>)
    | undefined;
  const usePage = load("accounts/use-account-page.ts", {
    react: h.react,
    "../finance/context": {
      useNativeFinance: () => ({
        authority: scope,
        accounts: { list, currentBalances },
        isCurrent: () => true,
      }),
    },
    "../finance/scope": { financeAuthorityKey },
    "../finance/use-resource": {
      useFinanceResource: (_selector: unknown, reader: typeof read) => {
        read = reader;
        return { kind: "loading" };
      },
    },
  }).useAccountPage as (include: boolean) => unknown;
  const captured = {
    ...scope,
    selector: {
      kind: "accounts" as const,
      householdId: scope.householdId,
      limit: 50,
    },
  };
  h.render(() => usePage(true));
  const signal = new AbortController().signal;
  const page = await read!(captured, signal);
  expect(currentBalances).toHaveBeenCalledExactlyOnceWith(
    scope.householdId,
    rows.map((row) => row.id),
    signal,
  );
  expect(page).toMatchObject({
    balances: [{ accountId: rows[0]!.id }, { accountId: rows[1]!.id }],
  });
  h.render(() => usePage(false));
  await read!(captured, signal);
  expect(currentBalances).toHaveBeenCalledOnce();
});

it("shows an estimated recorded balance without attributing a different manual valuation as its anchor", () => {
  const balance = {
    accountId: id,
    status: "AVAILABLE" as const,
    basis: "MANUAL_PLUS_LEDGER" as const,
    money: { amountMinor: "8500", currency: "GBP" as const },
    anchorId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    anchorDate: "2026-01-01",
    throughDate: "2026-01-10",
  };
  const imported = load("accounts/imported-balance.tsx", {
    "./account-labels": accountLabels,
  }).ImportedBalance as (props: { balance: typeof balance }) => unknown;
  const text = JSON.stringify(imported({ balance }));
  expect(text).toContain("£85.00");
  expect(text).toContain("Balance from recorded activity");
  expect(text).toContain("estimate");
  const Facts = load("accounts/account-facts.tsx", {
    "./account-labels": accountLabels,
    "./imported-balance": { ImportedBalance: "balance" },
  }).AccountFacts as (props: unknown) => unknown;
  const valuation: NonNullable<AccountResponse["latestValuation"]> = {
    id,
    money: { amountMinor: "10000", currency: "GBP" },
    adultMoney: { amountMinor: "10000", currency: "GBP" },
    asOfDate: "2026-01-05",
    recordedAt: "2026-01-05T00:00:00.000Z",
    complete: true,
    source: "MANUAL",
  };
  const rendered = JSON.stringify(
    Facts({ account: account({ latestValuation: valuation }), balance }),
  );
  expect(rendered).toContain("£100.00");
  expect(rendered).toContain("Recorded manual balance");
  expect(rendered).toContain("5 Jan 2026");
  expect(rendered).not.toContain("Total account value");
  expect(rendered).toContain("Manual valuation");
  expect(rendered).toContain("Adult portion of manual valuation");
  expect(rendered).not.toContain("Source valuation");
  const Row = load("accounts/account-row.tsx", {
    "./account-labels": accountLabels,
    "./imported-balance": { ImportedBalance: "balance" },
    "react-native": {
      Pressable: "pressable",
      View: "view",
      StyleSheet: { create: <T>(styles: T) => styles },
      useWindowDimensions: () => ({ width: 390, fontScale: 1 }),
    },
  }).AccountRow as (props: unknown) => unknown;
  const row = JSON.stringify(
    Row({
      account: account({ latestValuation: valuation }),
      balance,
      onOpen: vi.fn(),
    }),
  );
  expect(row).toContain("£100.00");
  expect(row).toContain("Recorded manual balance");
  expect(row).toContain("5 Jan 2026");
  expect(row).not.toContain("Total account value");
});
