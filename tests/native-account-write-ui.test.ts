import { expect, it, vi } from "vitest";
import { load, account, text } from "./fixtures/native-read-ui.js";
import { elements, press } from "./fixtures/native-source-harness.js";
import * as labels from "../apps/mobile/src/features/accounts/account-labels.js";
import * as input from "../apps/mobile/src/features/accounts/write-input.js";
import type { AccountResponse } from "../packages/contracts/src/index.js";
function session<T>(value: T, item: AccountResponse = account()) {
  return {
    account: item,
    allowed: true,
    stale: false,
    editable: true,
    resource: { kind: "ready", value: item, retry: vi.fn() },
    draft: {
      value,
      base: item,
      visible: true,
      message: "",
      change: vi.fn(),
      error: vi.fn(),
    },
    mutation: { kind: "idle" },
    submit: vi.fn(),
    reload: vi.fn(),
  };
}
it("valuation form submits explicitly attested adultMoney and signed amount input", () => {
  const state = session({
    amount: "-1.25",
    date: "2026-11-04",
    attested: true,
    adultAmount: "-1.25",
  });
  const Screen = load("accounts/valuation-screen.tsx", {
    "@/components/native-field": { NativeField: "field" },
    "@expo/ui": { Host: "host", Switch: "switch" },
    "expo-crypto": { randomUUID: () => "00000000-0000-4000-8000-000000000009" },
    "./use-account-write": { useAccountWrite: () => state },
    "./write-input": input,
    "./write-boundary": { WriteBoundary: "boundary" },
  }).ValuationScreen as (props: { accountId: string }) => unknown;
  const tree = Screen({ accountId: state.account.id });
  press(tree, "Save valuation");
  expect(state.submit).toHaveBeenCalledWith({
    kind: "valuation",
    key: "00000000-0000-4000-8000-000000000009",
    input: {
      money: { amountMinor: "-125", currency: "GBP" },
      adultMoney: { amountMinor: "-125", currency: "GBP" },
      asOfDate: "2026-11-04",
    },
  });
  expect(
    elements(tree).find((e) => e.props.label === "Value in GBP")?.props
      .keyboardType,
  ).toBe("numbers-and-punctuation");
});
it("sharing without a server-supplied partner offers the actual invitation path", () => {
  const state = session({ level: "NONE" });
  const push = vi.fn();
  const Screen = load("accounts/sharing-screen.tsx", {
    "expo-router": { useRouter: () => ({ push }) },
    "./use-account-write": { useAccountWrite: () => state },
    "./write-boundary": { WriteBoundary: "boundary" },
    "./account-choice": { AccountChoice: "choice" },
    "./account-labels": labels,
  }).SharingScreen as (props: { accountId: string }) => unknown;
  const tree = Screen({ accountId: state.account.id });
  expect(text(tree)).not.toContain("Save sharing");
  press(tree, "Invite another adult");
  expect(push).toHaveBeenCalledWith("/more");
  expect(state.submit).not.toHaveBeenCalled();
});
it("write boundary masks drafts during recheck and refuses viewer forms", () => {
  const router = { replace: vi.fn(), push: vi.fn() };
  const Boundary = load("accounts/write-boundary.tsx", {
    "expo-router": { useRouter: () => router },
    "./write-feedback": { WriteFeedback: "feedback" },
  }).WriteBoundary as (props: {
    session: unknown;
    title: string;
    children: unknown;
  }) => unknown;
  const state = session({ label: "Private draft" });
  expect(
    text(
      Boundary({
        session: { ...state, resource: { kind: "loading" } },
        title: "Edit account",
        children: "Private draft",
      }),
    ),
  ).not.toContain("Private draft");
  const denied = Boundary({
    session: { ...state, allowed: false },
    title: "Edit account",
    children: "Private draft",
  });
  expect(text(denied)).not.toContain("Private draft");
  expect(text(denied)).toContain("Only the account owner");
});
it("stale base offers explicit discard/reload and never silently confirms", () => {
  const state = session({});
  const Boundary = load("accounts/write-boundary.tsx", {
    "expo-router": { useRouter: () => ({ replace: vi.fn() }) },
    "./write-feedback": { WriteFeedback: "feedback" },
  }).WriteBoundary as (props: {
    session: unknown;
    title: string;
    children: unknown;
  }) => unknown;
  const tree = Boundary({
    session: { ...state, stale: true },
    title: "Edit account",
    children: "draft",
  });
  press(tree, "Discard draft and reload");
  expect(state.reload).toHaveBeenCalledOnce();
});
it("metadata screen validates the canonical draft before capturing an edit", () => {
  const state = session({
    label: "  Household cash  ",
    liquidity: "AVAILABLE",
  });
  const Screen = load("accounts/edit-screen.tsx", {
    "./use-account-write": { useAccountWrite: () => state },
    "./write-boundary": { WriteBoundary: "boundary" },
    "./metadata-fields": { MetadataFields: "fields" },
    "./write-input": input,
  }).EditAccountScreen as (props: { accountId: string }) => unknown;
  press(Screen({ accountId: state.account.id }), "Save account details");
  expect(state.submit).toHaveBeenCalledWith({
    kind: "metadata",
    input: { label: "Household cash", liquidity: "AVAILABLE" },
  });
});
it("create screen captures a private GBP create with a UUID and omits joint ownership", () => {
  const draft = {
    visible: true,
    value: { label: "Savings", liquidity: "AVAILABLE", kind: "SAVINGS" },
    message: "",
    error: vi.fn(),
    clear: vi.fn(),
    change: vi.fn(),
  };
  const capture = vi.fn(() => async () => account()),
    submit = vi.fn();
  const Screen = load("accounts/create-screen.tsx", {
    "expo-crypto": { randomUUID: () => "00000000-0000-4000-8000-000000000009" },
    "./use-write-draft": { useWriteDraft: () => draft },
    "../finance/context": { useNativeFinance: () => ({ authority: {} }) },
    "../finance/use-mutation": {
      useFinanceMutation: () => ({ kind: "idle", submit, reset: vi.fn() }),
    },
    "../finance/errors": { financeErrorMessage: () => "failure" },
    "./write-intent": { createAccountIntent: capture },
    "./write-input": input,
    "./metadata-fields": { MetadataFields: "fields" },
    "./account-choice": { AccountChoice: "choice" },
    "./account-labels": labels,
    "./write-feedback": { WriteFeedback: "feedback" },
  }).CreateAccountScreen as () => unknown;
  press(Screen(), "Create private account");
  expect(capture).toHaveBeenCalledWith(
    expect.anything(),
    {
      label: "Savings",
      liquidity: "AVAILABLE",
      kind: "SAVINGS",
      currency: "GBP",
    },
    "00000000-0000-4000-8000-000000000009",
  );
  expect(submit).toHaveBeenCalledOnce();
});
it("MFA recovery opens the real security flow and known rejection permits explicit reload", () => {
  const router = { push: vi.fn(), replace: vi.fn() },
    workflow = { showSecurity: vi.fn() },
    reset = vi.fn(),
    retry = vi.fn(),
    mfaReload = vi.fn(),
    reload = vi.fn();
  const Feedback = load("accounts/write-feedback.tsx", {
    "expo-router": { useRouter: () => router },
    "../identity/context": { useIdentity: () => ({ workflow }) },
  }).WriteFeedback as (props: { mutation: unknown; reload(): void }) => unknown;
  press(
    Feedback({
      mutation: {
        kind: "error",
        recovery: "security",
        message: "MFA expired",
        reset,
        retry,
      },
      reload: mfaReload,
    }),
    "Verify authenticator",
  );
  expect(workflow.showSecurity).toHaveBeenCalledWith(true);
  expect(router.push).toHaveBeenCalledWith("/more");
  expect(retry).not.toHaveBeenCalled();
  // A pre-MFA draft must not stay submittable against the version it held.
  expect(mfaReload).toHaveBeenCalledOnce();
  press(
    Feedback({
      mutation: {
        kind: "error",
        recovery: "retry",
        message: "Rejected",
        reset,
        retry,
      },
      reload,
    }),
    "Discard draft and reload",
  );
  expect(reload).toHaveBeenCalledOnce();
});
it("does not call an uncertain committed draft unapplied or offer a new intent", () => {
  const state = session({});
  const Boundary = load("accounts/write-boundary.tsx", {
    "expo-router": { useRouter: () => ({ replace: vi.fn() }) },
    "./write-feedback": { WriteFeedback: "feedback" },
  }).WriteBoundary as (props: {
    session: unknown;
    title: string;
    children: unknown;
  }) => unknown;
  const tree = Boundary({
    session: {
      ...state,
      stale: true,
      mutation: {
        kind: "uncertain",
        message: "Outcome unknown",
        recovery: "retry",
      },
    },
    title: "Valuation",
    children: "draft",
  });
  expect(text(tree)).not.toContain("has not been applied");
  expect(text(tree)).not.toContain("Discard draft and reload");
});
