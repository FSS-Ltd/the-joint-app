import { expect, it, vi } from "vitest";
import type { AccountResponse } from "../packages/contracts/src/index.js";
import type { NativeResourceScope } from "../apps/mobile/src/events/scope.js";
import type { NativeFinanceAuthority } from "../apps/mobile/src/features/finance/scope.js";
import { financeAuthorityKey } from "../apps/mobile/src/features/finance/scope.js";
import { scope } from "./fixtures/native-stream.js";
import { account, id, load } from "./fixtures/native-read-ui.js";
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
  const List = load("accounts/list-screen.tsx", {
    "expo-router": { useRouter: () => ({ push: vi.fn() }) },
    "./account-page": { AccountPage: "page" },
    "./account-row": { AccountRow: "row" },
  }).AccountListScreen as () => unknown;
  expect(elements(List())[0]?.props.scrollable).toBe(false);
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
