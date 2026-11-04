import type { IdentityState } from "../apps/mobile/src/features/identity/controller.js";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { financeFixture, financeMe } from "./fixtures/native-finance.js";
import {
  captureFinanceAuthority,
  financeAuthorityKey,
} from "../apps/mobile/src/features/finance/scope.js";
import { scope } from "./fixtures/native-stream.js";
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(0);
});
afterEach(() => vi.useRealTimers());
it("captures only the current verified ready membership, including every authority dimension", async () => {
  const f = await financeFixture();
  expect(f.finance.authority).toEqual({
    actor: scope.actor,
    userId: scope.userId,
    membershipId: scope.membershipId,
    householdId: scope.householdId,
    grantVersion: 0,
  });
  expect(captureFinanceAuthority(null, financeMe)).toBeNull();
  expect(
    captureFinanceAuthority(f.controller.getVerifiedIdentity(), {
      ...financeMe,
    }),
  ).toBeNull();
  for (const changed of [
    { actor: "replacement" },
    { userId: "other" },
    { membershipId: "other" },
    { householdId: "other" },
    { grantVersion: 1 },
  ])
    expect(
      financeAuthorityKey({ ...f.finance.authority, ...changed }),
    ).not.toBe(financeAuthorityKey(f.finance.authority));
  f.controller.background();
  expect(f.finance.isCurrent(f.finance.authority)).toBe(false);
  f.close();
});
it("provider caches its snapshot and reconciles only its still-current captured authority", async () => {
  const f = await financeFixture();
  const before = f.renderProvider();
  expect(f.renderProvider()).toBe(before);
  const reconciliation = before.reconcile(f.finance.authority);
  expect(f.controller.getVerifiedIdentity()).toBeNull();
  await reconciliation;
  expect(f.renderProvider(financeMe).authority).toBeNull();
  await before.reconcile(f.finance.authority);
  expect(f.api.readMe).toHaveBeenCalledTimes(2);
  f.close();
});
it("never delegates to the financial ready renderer before the complete identity decision chain", async () => {
  const { sourceExports, jsxBoundary, hookHarness } =
    await import("./fixtures/native-source-harness.js");
  let task: string | undefined;
  const mutation = { busy: false, quarantined: false, phase: "idle" };
  let state: IdentityState = { kind: "ready", me: financeMe };
  const identity = {
    get state() {
      return state;
    },
    mutations: { subscribe: () => () => {}, getSnapshot: () => mutation },
    sessionPending: false,
  };
  const gate = sourceExports(
    "apps/mobile/src/features/identity/identity-entry.tsx",
    {
      react: hookHarness().react,
      "react/jsx-runtime": jsxBoundary,
      "@clerk/expo": {
        useSession: () => ({
          session: task ? { currentTask: { key: task } } : null,
        }),
      },
      "expo-router": { usePathname: () => "/accounts/private" },
      "./context": { useIdentity: () => identity },
      "./mutation-screen": { MutationScreen: "mutation" },
      "./auth-screen": { AuthScreen: "auth" },
      "./security-screen": { SecurityScreen: "security" },
      "./password-task-screen": { PasswordTaskScreen: "password" },
      "./account-screen": { AccountScreen: "account" },
      "./session-actions": { SessionActions: "session" },
      "@/components/app-text": { AppText: "text" },
      "@/components/identity-frame": { IdentityFrame: "frame" },
      "@/components/native-action": { NativeAction: "action" },
      "@/components/native-actions": { NativeActions: "actions" },
    },
  ).IdentityEntry as (props: {
    ready: (me: typeof financeMe) => unknown;
  }) => unknown;
  const ready = vi.fn(() => "financial-route");
  for (const kind of [
    "loading",
    "signed-out",
    "locked",
    "security-required",
    "household-required",
  ] as const) {
    state =
      kind === "locked"
        ? { kind, reason: "expired" }
        : kind === "security-required" || kind === "household-required"
          ? { kind, me: financeMe }
          : { kind };
    gate({ ready });
    expect(ready).not.toHaveBeenCalled();
  }
  state = { kind: "ready", me: financeMe };
  for (const key of ["reset-password", "setup-mfa", "unknown-task"]) {
    task = key;
    gate({ ready });
    expect(ready).not.toHaveBeenCalled();
  }
  task = undefined;
  mutation.quarantined = true;
  gate({ ready });
  expect(ready).not.toHaveBeenCalled();
  mutation.quarantined = false;
  expect(gate({ ready })).toBe("financial-route");
  expect(ready).toHaveBeenCalledWith(financeMe);
});
