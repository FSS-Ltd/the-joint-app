import { existsSync } from "node:fs";
import { expect, it, vi } from "vitest";
import * as contracts from "../packages/contracts/src/index.js";
import type { AccountResponse } from "../packages/contracts/src/index.js";
import { valueAccounts } from "../packages/domain/src/wealth/value-accounts.js";
import {
  elements,
  hookHarness,
  press,
} from "./fixtures/native-source-harness.js";
import {
  account,
  householdId,
  id,
  load,
  text,
} from "./fixtures/native-read-ui.js";

it("mounts actual Tabs only through the configured financial ready gate", () => {
  for (const route of [
    "_layout",
    "home/_layout",
    "home/index",
    "home/accounts/index",
    "home/accounts/[accountId]/index",
    "wealth",
    "more",
  ])
    expect(existsSync(`apps/mobile/app/(workspace)/${route}.tsx`), route).toBe(
      true,
    );
  const tabs = Object.assign("tabs", { Screen: "tab" });
  const Workspace = load("navigation/workspace-layout.tsx", {
    "expo-router": { Tabs: tabs },
    "react-native": {
      useWindowDimensions: () => ({ fontScale: 1, width: 390 }),
      StyleSheet: { create: <T>(styles: T) => styles },
      View: "view",
    },
    "react-native-svg": { default: "svg", Path: "path" },
    "react-native-safe-area-context": {
      useSafeAreaInsets: () => ({ top: 0, bottom: 34, left: 0, right: 0 }),
    },
    "./navigation-tab-button": { NavigationTabButton: "tab-button" },
    "../identity/configured-entry": { ConfiguredEntry: "gate" },
    "../identity/account-screen": { AccountScreen: "account" },
    "../finance/provider": { NativeFinanceProvider: "finance" },
  }).WorkspaceLayout as () => unknown;
  const gate = elements(Workspace())[0]!;
  expect(gate.type).toBe("gate");
  expect(elements(gate).some((e) => e.type === tabs)).toBe(false);
  const Ready = (
    gate.props.ready as (me: unknown) => {
      type: (props: unknown) => unknown;
      props: unknown;
    }
  )({ membership: {} });
  const tree = Ready.type(Ready.props);
  expect(elements(tree)[0]?.type).toBe("finance");
  const noMembership = (gate.props.ready as (me: unknown) => unknown)({
    membership: null,
  });
  expect(elements(noMembership)[0]?.type).toBe("account");
  expect(elements(noMembership).some((e) => e.type === "finance")).toBe(false);
  const tabsByName = elements(tree).filter((e) => e.type === "tab");
  expect(tabsByName.map((e) => e.props.name)).toEqual([
    "home",
    "activity",
    "goals",
    "wealth",
    "more",
    "imports",
    "budgets",
    "review",
    "billing",
    "companion",
  ]);
  expect(
    tabsByName
      .slice(0, 5)
      .map(
        (e) =>
          (e.props.options as { tabBarAccessibilityLabel: string })
            .tabBarAccessibilityLabel,
      ),
  ).toEqual(["Home", "Activity", "Goals", "Wealth", "More"]);
  // Hidden tabs reachable from Home without a tab in the bar. A null href is a
  // hidden tab in expo-router 58 that router.push cannot reach, so only the button is hidden.
  for (const name of ["imports", "budgets", "review", "billing", "companion"]) {
    const options = tabsByName.find((e) => e.props.name === name)?.props
      .options as {
      href?: unknown;
      tabBarButton?: () => unknown;
      tabBarItemStyle?: { display?: string };
    };
    expect(options.href).toBeUndefined();
    expect(options.tabBarButton?.()).toBeNull();
    // display none is what removes the flex slot and the accessibility subtree.
    expect(options.tabBarItemStyle?.display).toBe("none");
  }
});

it("rejects missing, malformed and array account route IDs before mounting a reader", () => {
  const route = load("accounts/account-route.tsx", {
    "expo-router": {
      useLocalSearchParams: () => ({}),
      useRouter: () => ({ replace: vi.fn() }),
    },
    "./detail-screen": { AccountDetailScreen: "detail" },
    "./route-id": {
      parseAccountRouteId: (value: unknown) =>
        typeof value === "string" &&
        contracts.idempotencyKeySchema.safeParse(value).success
          ? value.toLowerCase()
          : null,
    },
  });
  const Route = route.AccountRoute as () => unknown;
  expect(elements(Route()).some((e) => e.type === "detail")).toBe(false);
  const replace = vi.fn();
  for (const value of [undefined, "bad", [id]]) {
    const Invalid = load("accounts/account-route.tsx", {
      "expo-router": {
        useLocalSearchParams: () => ({ accountId: value }),
        useRouter: () => ({ replace }),
      },
      "./detail-screen": { AccountDetailScreen: "detail" },
      "./route-id": load("accounts/route-id.ts"),
    }).AccountRoute as () => unknown;
    const tree = Invalid();
    expect(elements(tree).some((e) => e.type === "detail")).toBe(false);
    press(tree, "Open accounts");
  }
  expect(replace.mock.calls).toEqual([
    ["/home/accounts"],
    ["/home/accounts"],
    ["/home/accounts"],
  ]);
  const parse = load("accounts/route-id.ts").parseAccountRouteId as (
    value: unknown,
  ) => string | null;
  for (const bad of [undefined, "", "bad", [id], [id, id], null])
    expect(parse(bad)).toBeNull();
  expect(parse(id.toUpperCase())).toBe(id);
});

it("preserves exact owner, NONE/TOTALS/TRANSACTIONS and unknown-adult labels", () => {
  const labels = load("accounts/account-labels.ts");
  const owner = labels.ownerLabel as (value: AccountResponse) => string;
  expect(owner(account())).toBe("Sole owner: you");
  expect(owner(account({ ownership: "SHARED" }))).toBe(
    "Owner: other household adult",
  );
  expect(owner(account({ legalOwnerKind: "JOINT_ADULT" }))).toBe(
    "Joint adult ownership",
  );
  expect(labels.grantLabels).toEqual({
    NONE: "Private",
    TOTALS: "Values only",
    TRANSACTIONS: "Values and details",
  });
  const facts = load("accounts/account-facts.tsx", {
    "./account-labels": labels,
    "./imported-balance": { ImportedBalance: "imported-balance" },
  }).AccountFacts as (props: { account: AccountResponse }) => unknown;
  expect(text(facts({ account: account() }))).toContain(
    "No valuation recorded",
  );
  const populated = account({
    latestValuation: {
      id,
      money: { amountMinor: "12500", currency: "GBP" },
      adultMoney: null,
      asOfDate: "2026-11-01",
      recordedAt: "2026-11-01T12:00:00.000Z",
      complete: false,
      source: "MANUAL",
    },
  });
  expect(text(facts({ account: populated }))).toContain("£125.00");
  expect(text(facts({ account: populated }))).toContain(
    "Adult portion unknown",
  );
  expect(text(facts({ account: populated }))).toContain("Incomplete valuation");
  expect(
    text(
      facts({
        account: account({
          ownership: "SHARED",
          access: "TOTALS",
          sharing: null,
        }),
      }),
    ),
  ).toContain("Values only");
});

it("renders server totals beyond int64 and keeps missing evidence unavailable", () => {
  const summary = valueAccounts({
    householdId,
    grantVersion: 0,
    asOfDate: "2026-11-04",
    calculatedAt: "2026-11-04T12:00:00.000Z",
    accounts: [],
  });
  const coverage = load("home/summary-coverage.tsx", {
    "../accounts/account-labels": load("accounts/account-labels.ts"),
  });
  const card = load("home/summary-card.tsx", { "./summary-coverage": coverage })
    .SummaryCard as (props: { summary: typeof summary }) => unknown;
  expect(text(card({ summary }))).toContain("No accounts in this scope");
  const populated = {
    ...summary,
    scope: { ...summary.scope, accountIds: [id] },
    adultNetWorth: {
      amountMinor: "9223372036854775808",
      currency: "GBP" as const,
    },
    liquidAdultAssets: null,
  };
  expect(text(card({ summary: populated }))).toContain(
    "£92,233,720,368,547,758.08",
  );
  expect(text(card({ summary: populated }))).toContain("Unavailable");
  // A pinned line height cannot follow Dynamic Type and clips the headline figure.
  expect(text(card({ summary: populated }))).not.toContain('"lineHeight"');
  const Coverage = coverage.SummaryCoverage as (props: {
    summary: typeof summary;
    concise?: boolean;
  }) => unknown;
  const scopedEvidence: typeof summary = {
    ...populated,
    excludedReasons: ["STALE_VALUATION"],
    valuations: [
      {
        accountId: id,
        valuationId: id,
        asOfDate: "2026-11-03",
        source: "MANUAL",
      },
    ],
  };
  const concise = elements(card({ summary: scopedEvidence })).find(
    (element) => element.type === Coverage,
  );
  expect(concise?.props.concise).toBe(true);
  const evidenceText = text(
    Coverage({ summary: scopedEvidence, concise: true }),
  );
  expect(evidenceText).toContain("Manual valuations");
  expect(evidenceText).toContain("Stale valuation");
  expect(
    text(
      Coverage({
        summary: {
          ...summary,
          excludedReasons: ["STALE_VALUATION", "UNKNOWN_ADULT_PORTION"],
          completeness: "PARTIAL",
        },
      }),
    ),
  ).toContain("Stale valuation");
  expect(
    text(
      Coverage({
        summary: { ...summary, excludedReasons: ["UNKNOWN_ADULT_PORTION"] },
      }),
    ),
  ).toContain("Adult portion unknown");
});

it("canonicalizes selected scope, rejects empty and >50, and never changes empty to all-visible", () => {
  const scope = load("home/summary-scope.ts");
  const selected = scope.selectedSummaryScope as (
    ids: readonly string[],
  ) => unknown;
  expect(selected([id.toUpperCase()])).toEqual({
    kind: "selected",
    accountIds: [id],
  });
  expect(() => selected([])).toThrow();
  expect(() =>
    selected(
      Array.from(
        { length: 51 },
        (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
      ),
    ),
  ).toThrow();
});

it("keeps scope selection available after errors and detaches summary while picker is open", () => {
  const h = hookHarness();
  const push = vi.fn();
  const Home = load("home/home-screen.tsx", {
    react: h.react,
    "expo-router": { useRouter: () => ({ push }) },
    "../finance/context": {
      useNativeFinance: () => ({ authority: { actor: "a" } }),
    },
    "../finance/scope": { financeAuthorityKey: () => "authority" },
    "./summary-scope": {
      selectedSummaryScope: (accountIds: string[]) => ({
        kind: "selected",
        accountIds,
      }),
    },
    "./summary-view": { SummaryView: "summary" },
    "./home-insights": { HomeInsights: "insights" },
    "./home-activity": { HomeActivity: "activity" },
    "../accounts/scope-selection": { ScopeSelection: "picker" },
  }).HomeContent as () => unknown;
  let tree = h.render(Home);
  const summary = elements(tree).find((e) => e.type === "summary")!;
  press(tree, "Import CSV");
  press(tree, "Review plan");
  expect(push.mock.calls).toEqual([["/imports"], ["/review"]]);
  (summary.props.onChoose as () => void)();
  tree = h.render(Home);
  expect(elements(tree).some((e) => e.type === "picker")).toBe(true);
  expect(elements(tree).some((e) => e.type === "summary")).toBe(false);
  const picker = elements(tree).find((e) => e.type === "picker")!;
  (picker.props.onApply as (ids: string[]) => void)([id]);
  const selection = elements(h.render(Home)).find((e) => e.type === "summary")!;
  expect(selection.props.scope).toEqual({ kind: "selected", accountIds: [id] });
  (selection.props.onReset as () => void)();
  expect(
    elements(h.render(Home)).find((e) => e.type === "summary")?.props.scope,
  ).toEqual({
    kind: "visible",
  });
});

it("previews transactions only for an account with detail access in the summary scope", () => {
  const privateAccount = account({
    id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    label: "Values only account",
    ownership: "SHARED",
    access: "TOTALS",
    sharing: null,
  });
  let items = [privateAccount, account()];
  const Activity = load("home/home-activity.tsx", {
    "expo-router": { useRouter: () => ({ push: vi.fn() }) },
    "../accounts/account-labels": load("accounts/account-labels.ts"),
    "../accounts/use-account-page": {
      useAccountPage: () => ({ resource: { kind: "ready", value: { items } } }),
    },
    "../activity/activity-query": load("activity/activity-query.ts"),
    "../finance/context": { useNativeFinance: vi.fn() },
    "../finance/use-resource": { useFinanceResource: vi.fn() },
  }).HomeActivity as (props: {
    scope: { kind: "visible" } | { kind: "selected"; accountIds: string[] };
  }) => unknown;

  const preview = (scope: Parameters<typeof Activity>[0]["scope"]) =>
    elements(Activity({ scope })).find(
      (element) => element.props.accountId !== undefined,
    );

  expect(preview({ kind: "visible" })?.props.accountId).toBe(id);
  expect(
    preview({ kind: "selected", accountIds: [privateAccount.id] }),
  ).toBeUndefined();
  items = [privateAccount];
  expect(preview({ kind: "visible" })).toBeUndefined();
});

it("preserves invitation and security destinations after verified sign-in", () => {
  const identity = {
    invitation: null as string | null,
    workflow: { securityOpen: false },
  };
  const Landing = load("navigation/landing-entry.tsx", {
    "expo-router": { Redirect: "redirect" },
    "../identity/configured-entry": { ConfiguredEntry: "gate" },
    "../identity/context": { useIdentity: () => identity },
    "../identity/account-screen": { AccountScreen: "account" },
  }).LandingEntry as () => unknown;
  const gate = elements(Landing())[0]!;
  const ready = gate.props.ready as (me: unknown) => {
    type: (props: unknown) => unknown;
    props: unknown;
  };
  const render = (membership: unknown = {}) => {
    const element = ready({ membership });
    return elements(element.type(element.props))[0]!;
  };
  expect(render()).toMatchObject({
    type: "redirect",
    props: { href: "/home" },
  });
  expect(render(null)).toMatchObject({
    type: "redirect",
    props: { href: "/more" },
  });
  identity.invitation = "synthetic-pending-invitation";
  expect(render().type).toBe("account");
  expect(render(null).type).toBe("account");
  identity.invitation = null;
  identity.workflow.securityOpen = true;
  expect(render().type).toBe("account");
  expect(render(null).type).toBe("account");
});

it("selects across >50 visible accounts without treating an empty selection as all-visible", () => {
  const h = hookHarness();
  const apply = vi.fn();
  const Picker = load("accounts/scope-selection.tsx", {
    react: h.react,
    "@expo/ui": { Host: "host", Switch: "switch" },
    "./account-page": { AccountPage: "page" },
    "./account-labels": load("accounts/account-labels.ts"),
  }).ScopeSelection as (props: {
    initialIds: string[];
    onApply(ids: string[]): void;
    onCancel(): void;
  }) => unknown;
  const ids = Array.from(
    { length: 51 },
    (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
  );
  const render = () =>
    h.render(() =>
      Picker({ initialIds: [], onApply: apply, onCancel: vi.fn() }),
    );
  expect(
    elements(render()).find((e) => e.props.label === "Use selected accounts")
      ?.props.disabled,
  ).toBe(true);
  const toggle = (value: string, include: boolean) => {
    const row = (
      elements(render())[0]!.props.renderAccount as (
        a: AccountResponse,
      ) => unknown
    )(account({ id: value }));
    const control = elements(row).find((e) => e.type === "switch")!;
    expect(control.props.label).toBe("Include Current account in summary");
    (control.props.onValueChange as (value: boolean) => void)(include);
    return control;
  };
  ids.slice(0, 50).forEach((value) => toggle(value, true));
  expect(toggle(ids[50]!, true).props.disabled).toBe(true);
  press(render(), "Use selected accounts");
  expect(apply).toHaveBeenLastCalledWith(ids.slice(0, 50));
  toggle(ids[0]!, false);
  toggle(ids[50]!, true);
  press(render(), "Use selected accounts");
  expect(apply).toHaveBeenLastCalledWith(ids.slice(1));
  press(render(), "Clear selection");
  press(render(), "Use selected accounts");
  expect(apply).toHaveBeenCalledTimes(2);
});
