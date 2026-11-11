import * as resourceMemory from "../apps/mobile/src/features/finance/resource-memory.js";
import { createNativeTransport } from "./fixtures/native-api.js";
import { IdentityMutations } from "../apps/mobile/src/features/identity/mutations.js";
import { sessionActor } from "../apps/mobile/src/features/identity/provider-session.js";
import { sessionFixture as fixture } from "./fixtures/native-session-harness.js";
import { expect, it, vi } from "vitest";
import {
  sourceExports,
  hookHarness,
  jsxBoundary,
  elements,
} from "./fixtures/native-source-harness.js";
import { NativeWorkflow } from "../apps/mobile/src/features/identity/workflow.js";
import { NativeIdentityController } from "../apps/mobile/src/features/identity/controller.js";
it.each(["missing token", "expired token", "disabled API profile"])(
  "offers explicit local recovery for %s while preserving server-first logout",
  async (reason) => {
    const f = await fixture();
    if (reason === "missing token") f.original.getToken.mockResolvedValue(null);
    await f.screen.render().logout("global");
    expect(f.clerk.signOut).not.toHaveBeenCalled();
    await f.screen.render().discardRejectedSignIn?.();
    expect(f.original.remove).toHaveBeenCalledOnce();
    expect(f.clerk.signOut).not.toHaveBeenCalled();
    await f.controller.identify(null);
    f.workflow.identify(null);
    const actions = f.screen.render();
    expect(f.controller.getSnapshot()).toEqual({ kind: "signed-out" });
    expect(actions.sessionNotice).toContain("could not be confirmed");
    await f.controller.identify("user:a");
    expect(f.controller.getSnapshot()).toEqual({
      kind: "locked",
      reason: "expired",
    });
    f.screen.unmount();
    f.controller.dispose();
  },
);
it("never offers terminal credential discard for a transient 503", async () => {
  const f = await fixture(503);
  await f.screen.render().logout("global");
  expect(f.screen.render().discardRejectedSignIn).toBeUndefined();
  expect(f.clerk.signOut).not.toHaveBeenCalled();
  expect(f.screen.render().sessionNotice).toBe("");
  f.screen.unmount();
  f.controller.dispose();
});
it("does not invoke Clerk's stale-ID single-session fallback after actor replacement", async () => {
  const f = await fixture();
  let resolve: ((value: { state: string }) => void) | undefined;
  f.backend.mockImplementationOnce(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  const pending = f.screen.render().logout("global");
  await Promise.resolve();
  await Promise.resolve();
  const replacement = { ...f.original, id: "b", user: { id: "other" } };
  f.clerk.session = replacement;
  f.clerk.client.signedInSessions = [replacement];
  f.workflow.identify("other:b");
  await f.controller.identify("other:b");
  resolve?.({ state: "SIGNED_OUT" });
  await pending;
  expect(f.clerk.signOut).not.toHaveBeenCalled();
  expect(f.clerk.session).toBe(replacement);
  f.screen.unmount();
  f.controller.dispose();
});
it("keeps background concealment after a late server logout and never starts foreground reads", async () => {
  const f = await fixture();
  let resolve: ((value: { state: string }) => void) | undefined;
  f.backend.mockImplementationOnce(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  const pending = f.screen.render().logout("local");
  await Promise.resolve();
  await Promise.resolve();
  f.workflow.conceal();
  f.controller.background();
  const reads = f.api.readMe.mock.calls.length;
  resolve?.({ state: "SIGNED_OUT" });
  await pending;
  expect(f.controller.getSnapshot()).toEqual({
    kind: "locked",
    reason: "background",
  });
  expect(f.api.readMe).toHaveBeenCalledTimes(reads);
  f.screen.unmount();
  f.controller.dispose();
});
it.each(["expired capability", "malformed capability"])(
  "durably retires %s and exposes honest recovery notice after remount",
  async (reason) => {
    const f = await fixture(401, reason);
    f.clerk.session = null;
    f.clerk.client.signedInSessions = [];
    await f.controller.identify(null);
    f.workflow.identify(null);
    expect(f.screen.render().cleanupPending).toBe(true);
    await f.screen.render().retryCleanup();
    expect(f.disk()).toBeNull();
    expect(f.screen.render().cleanupPending).toBe(false);
    expect(f.screen.render().sessionNotice).toContain(
      "remote provider cleanup was not confirmed",
    );
    // Execute the gate and signed-out auth screen: notice must remain visible when authentication opens.
    const tree = sourceExports(
      "apps/mobile/src/features/identity/identity-entry.tsx",
      {
        "react/jsx-runtime": jsxBoundary,
        react: hookHarness().react,
        "./mutation-screen": { MutationScreen: "mutation" },
        "@clerk/expo": { useSession: () => ({ session: null }) },
        "expo-router": { usePathname: () => "/" },
        "./context": {
          useIdentity: () => ({
            ...f.screen.render(),
            state: f.controller.getSnapshot(),
            mutations: f.mutations,
            workflow: f.workflow,
          }),
        },
        "@/components/app-text": { AppText: "text" },
        "@/components/identity-frame": { IdentityFrame: "frame" },
        "@/components/native-action": { NativeAction: "action" },
        "@/components/native-actions": { NativeActions: "actions" },
        "./auth-screen": { AuthScreen: "auth" },
        "./security-screen": { SecurityScreen: "security" },
        "./password-task-screen": { PasswordTaskScreen: "password" },
        "./account-screen": { AccountScreen: "account" },
        "../privacy/deletion-receipt-screen": {
          DeletionReceiptScreen: "deletion-receipt",
        },
        "./session-actions": { SessionActions: "session" },
      },
    ).IdentityEntry as () => unknown;
    expect(elements(tree())[0]?.type).toBe("auth");
    f.screen.unmount();
    const restarted = f.mount();
    await Promise.resolve();
    await Promise.resolve();
    expect(restarted.render().cleanupPending).toBe(false);
    await f.controller.identify("user:a");
    expect(f.controller.getSnapshot()).toEqual({
      kind: "locked",
      reason: "expired",
    });
    restarted.unmount();
    f.controller.dispose();
  },
);
it("keeps a rejected capability when durable removal fails and exposes an error", async () => {
  const f = await fixture(401, "old-ticket");
  f.storage.deleteItemAsync.mockRejectedValueOnce(Error());
  await f.screen.render().retryCleanup();
  expect(f.disk()).toBe("old-ticket");
  expect(f.screen.render().cleanupPending).toBe(true);
  expect(f.screen.render().sessionNotice).toBe("");
  expect(f.screen.render().sessionError).not.toBe("");
  f.screen.unmount();
  f.controller.dispose();
});
it("retains cleanup on 503 and retains earlier global cleanup when a replacement session logs out", async () => {
  const f = await fixture(503, "global-ticket-a");
  await f.screen.render().retryCleanup();
  expect(f.disk()).toBe("global-ticket-a");
  f.backend.mockResolvedValue({
    state: "SIGNED_OUT",
    providerCleanupPending: true,
    providerCleanupToken: "local-ticket-b",
  });
  const b = { ...f.original, id: "b" };
  f.clerk.session = b;
  f.clerk.client.signedInSessions = [b];
  f.workflow.identify("user:b");
  await f.controller.identify("user:b");
  await f.screen.render().logout("local");
  expect(JSON.parse(f.disk() ?? "[]")).toEqual([
    "global-ticket-a",
    "local-ticket-b",
  ]);
  f.screen.unmount();
  f.controller.dispose();
});
it("retains outstanding cleanup during explicit local credential discard", async () => {
  const f = await fixture(401, "global-ticket-a");
  await f.screen.render().discardRejectedSignIn?.();
  expect(f.disk()).toBe("global-ticket-a");
  expect(f.screen.render().cleanupPending).toBe(true);
  f.screen.unmount();
  f.controller.dispose();
});
it("ordinary runtime refresh cannot override background or undefined provider state", async () => {
  const f = await fixture(503);
  const h = hookHarness();
  let change: ((value: string) => void) | undefined;
  let emit: ((event: unknown) => void) | undefined;
  const appState = {
    currentState: "active",
    addEventListener: (_name: string, listener: (value: string) => void) => {
      change = listener;
      return { remove: () => {} };
    },
  };
  const context = { Provider: "provider" };
  const actions = { ...f.screen.render(), pending: { current: false } };
  const constructTransport = vi.fn(createNativeTransport);
  const composeIdentity = vi.fn(() => f.api);
  const runtime = sourceExports(
    "apps/mobile/src/features/identity/runtime.tsx",
    {
      react: h.react,
      "react/jsx-runtime": jsxBoundary,
      "@clerk/expo": {
        useSession: () => ({ session: f.original, isLoaded: true }),
        useClerk: () => ({
          ...f.clerk,
          addListener: (listener: (event: unknown) => void) => {
            emit = listener;
            listener({ session: f.clerk.session });
            return () => {};
          },
        }),
      },
      "react-native": { AppState: appState, View: "view" },
      "expo-linking": {
        getInitialURL: async () => null,
        addEventListener: () => ({ remove: () => {} }),
      },
      "../../api/request": { createNativeTransport: constructTransport },
      "../../api/privacy": { createPrivacyApi: () => ({}) },
      "../finance/resource-memory": resourceMemory,
      "./api": { createIdentityApiFromTransport: composeIdentity },
      "./context": { IdentityContext: context },
      "./mutations": { IdentityMutations },
      "./provider-session": { sessionActor },
      "./workflow": { NativeWorkflow },
      "./controller": { NativeIdentityController },
      "./returns": { readInvitationLink: () => null },
      "./use-session-actions": { useSessionActions: () => actions },
      "./use-native-sso": {
        useNativeSso: () => ({ pending: false, revision: 0 }),
      },
      "./unavailable": { IdentityUnavailable: "unavailable" },
    },
  ).IdentityRuntime as (props: unknown) => unknown;
  const render = () =>
    h.render(() =>
      runtime({ configuration: { apiUrl: "https://synthetic.test" } }),
    );
  render();
  const bridge = (
    elements(render())[0]?.props.value as {
      finance: { transport: unknown; getVerifiedIdentity(): unknown };
    }
  ).finance;
  expect(constructTransport).toHaveBeenCalledOnce();
  expect(composeIdentity).toHaveBeenCalledOnce();
  expect(bridge.transport).toBe(constructTransport.mock.results[0]?.value);
  expect(composeIdentity).toHaveBeenCalledWith(bridge.transport);
  await Promise.resolve();
  emit?.({ session: undefined });
  expect(bridge.getVerifiedIdentity()).toBeNull();
  const masked = elements(render())[0]?.props.value as {
    state: unknown;
    refresh(): Promise<void>;
  };
  expect(masked.state).toEqual({ kind: "locked", reason: "transition" });
  const beforeUndefined = f.api.readMe.mock.calls.length;
  await masked.refresh();
  change?.("active");
  expect(f.api.readMe).toHaveBeenCalledTimes(beforeUndefined);
  emit?.({ session: f.original });
  await Promise.resolve();
  expect(f.api.readMe.mock.calls.length).toBeGreaterThan(beforeUndefined);
  appState.currentState = "background";
  change?.("background");
  const before = f.api.readMe.mock.calls.length;
  const value = elements(render())[0]?.props.value as {
    refresh(): Promise<void>;
    state: unknown;
  };
  await value.refresh();
  expect(f.api.readMe).toHaveBeenCalledTimes(before);
  expect(
    (elements(render())[0]?.props.value as { state: unknown }).state,
  ).toEqual({ kind: "locked", reason: "background" });
  h.unmount();
  f.screen.unmount();
  f.controller.dispose();
});
it("keeps recovery notice visible in the actual signed-out authentication screen", async () => {
  const f = await fixture();
  await f.screen.render().discardRejectedSignIn?.();
  const h = hookHarness();
  const auth = sourceExports(
    "apps/mobile/src/features/identity/auth-screen.tsx",
    {
      react: h.react,
      "react/jsx-runtime": jsxBoundary,
      "react-native": {
        View: "view",
        StyleSheet: { create: <T>(styles: T) => styles },
      },
      "@joint/contracts": {},
      "@/theme/tokens": { colors: {}, corners: {}, spacing: {} },
      "expo-router": { useRouter: () => ({}) },
      "./context": { useIdentity: () => f.screen.render() },
      "./use-auth-flow": {
        useNativeAuthFlow: () => ({
          stage: { step: "credentials" },
          pending: false,
        }),
      },
      "@/components/app-text": { AppText: "text" },
      "@/components/identity-frame": {
        IdentityFrame: "frame",
        Feedback: "feedback",
      },
      "@/components/native-action": { NativeAction: "action" },
      "@/components/native-actions": { NativeActions: "actions" },
      "@/components/native-field": { NativeField: "field" },
    },
  ).AuthScreen as (props: unknown) => unknown;
  const tree = h.render(() => auth({ mode: "sign-in" }));
  expect(
    elements(tree).some(
      (item) =>
        item.type === "feedback" &&
        String(item.props.notice).includes("could not be confirmed"),
    ),
  ).toBe(true);
  h.unmount();
  f.screen.unmount();
  f.controller.dispose();
});
it("retires an expired stored capability after the 30-minute cutoff and process remount", async () => {
  const issued = Date.now(),
    f = await fixture(401, "expired-ticket");
  f.screen.unmount();
  const now = vi.spyOn(Date, "now").mockReturnValue(issued + 31 * 60 * 1000);
  try {
    f.api.retryLogoutCleanup.mockImplementation(async () => {
      if (Date.now() > issued + 30 * 60 * 1000) throw { status: 401 };
      return { state: "SIGNED_OUT" };
    });
    const restarted = f.mount();
    await Promise.resolve();
    await Promise.resolve();
    await restarted.render().retryCleanup();
    expect(f.disk()).toBeNull();
    expect(restarted.render().cleanupPending).toBe(false);
    expect(restarted.render().sessionNotice).toContain("not confirmed");
    restarted.unmount();
  } finally {
    now.mockRestore();
    f.controller.dispose();
  }
});
it("does not conceal or discard a replacement actor through an earlier recovery action", async () => {
  const f = await fixture(),
    oldAction = f.screen.render().discardRejectedSignIn;
  const b = { ...f.original, id: "b", user: { id: "other" } };
  f.clerk.session = b;
  f.clerk.client.signedInSessions = [b];
  f.workflow.identify("other:b");
  await f.controller.identify("other:b");
  const before = f.controller.getSnapshot();
  await oldAction?.();
  expect(f.controller.getSnapshot()).toBe(before);
  expect(f.clerk.signOut).not.toHaveBeenCalled();
  f.screen.unmount();
  f.controller.dispose();
});
