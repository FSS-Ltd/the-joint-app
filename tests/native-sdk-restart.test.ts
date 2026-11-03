import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  nativeClerkHarness,
  deferred,
} from "./fixtures/native-clerk-harness.js";
import {
  hookHarness,
  sourceExports,
  jsxBoundary,
  press,
} from "./fixtures/native-source-harness.js";
import { IdentityMutations } from "../apps/mobile/src/features/identity/mutations.js";
import { NativeWorkflow } from "../apps/mobile/src/features/identity/workflow.js";
import * as shared from "../packages/identity-runtime/src/clerk-flow.js";
beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
async function fixture() {
  const f = await nativeClerkHarness(true),
    workflow = new NativeWorkflow();
  const mutations = new IdentityMutations({
    current: () => f.clerk.session,
    find: (id) => f.clerk.client.signedInSessions.find((s) => s.id === id),
    select: (id) => f.clerk.setActive({ session: id }),
    block: () => {},
    settle: async () => {},
  });
  const off = f.clerk.addListener(({ session }) => mutations.observe(session));
  return { ...f, workflow, mutations, off };
}
it("starts fresh signup, signin and recovery after explicit restart without removing existing sessions", async () => {
  const f = await fixture(),
    gate = deferred<void>();
  const pending = f.mutations.run(async () => {
    await gate.promise;
  }, "session");
  await f.clerk.setActive({ session: "b" });
  gate.resolve();
  await pending;
  f.workflow.rememberEmail("recovery", "signin_complete", "recovery", true);
  const h = hookHarness();
  const Screen = sourceExports(
    "apps/mobile/src/features/identity/mutation-screen.tsx",
    {
      react: h.react,
      "react/jsx-runtime": jsxBoundary,
      "@clerk/expo": {
        useSignIn: () => ({ signIn: f.clerk.client.signIn.__internal_future }),
        useSignUp: () => ({ signUp: f.clerk.client.signUp.__internal_future }),
      },
      "@joint/identity-runtime": shared,
      "./context": {
        useIdentity: () => ({ mutations: f.mutations, workflow: f.workflow }),
      },
      "@/components/app-text": { AppText: "text" },
      "@/components/identity-frame": {
        IdentityFrame: "frame",
        Feedback: "feedback",
      },
      "@/components/native-action": { NativeAction: "action" },
      "@/components/native-actions": { NativeActions: "actions" },
    },
  ).MutationScreen as () => unknown;
  press(h.render(Screen), "Start sign-in again");
  for (let i = 0; i < 100 && f.mutations.getSnapshot().busy; i++)
    await Promise.resolve();
  expect(f.mutations.getSnapshot()).toMatchObject({
    busy: false,
    quarantined: false,
  });
  expect(f.clerk.session).toBeNull();
  for (const mode of ["sign-in", "recovery", "sign-up"] as const)
    expect(
      f.workflow.stage(
        mode,
        mode === "sign-up" ? f.clerk.client.signUp : f.clerk.client.signIn,
      ),
    ).toEqual({ step: "credentials" });
  expect(f.workflow.resendAt("recovery", "signin_complete")).toBe(0);
  expect(f.clerk.client.signedInSessions.map((s) => s.id)).toEqual([
    "a",
    "b",
    "c",
  ]);
  expect(f.calls.some((path) => path.endsWith("/remove"))).toBe(false);
  f.off();
  h.unmount();
});
it("remembers external A after B during C activation while ignoring C's late completion", async () => {
  const f = await fixture(),
    gate = deferred<void>();
  f.delays.set("/v1/client/sessions/c/tokens", gate.promise);
  const pending = f.mutations.run(
    (scope) => scope.activate("c", () => f.clerk.setActive({ session: "c" })),
    "session",
  );
  for (
    let i = 0;
    i < 100 && !f.calls.includes("/v1/client/sessions/c/tokens");
    i++
  )
    await Promise.resolve();
  expect(f.calls).toContain("/v1/client/sessions/c/tokens");
  await f.clerk.setActive({ session: "b" });
  await f.clerk.setActive({ session: "a" });
  gate.resolve();
  await pending;
  expect(f.clerk.session?.id).toBe("c");
  expect(f.mutations.getSnapshot().quarantined).toBe(true);
  await f.mutations.reselect();
  expect(f.clerk.session?.id).toBe("a");
  expect(f.mutations.getSnapshot().quarantined).toBe(false);
  f.off();
});
it("retains quarantine and the existing session when an explicit attempt reset fails", async () => {
  const f = await fixture(),
    original = deferred<void>();
  const pending = f.mutations.run(async () => {
    await original.promise;
  }, "session");
  await f.clerk.setActive({ session: "b" });
  original.resolve();
  await pending;
  const gate = deferred<void>();
  const reset = f.mutations.restart(async () => {
    await f.clerk.client.signIn.__internal_future.reset();
    await gate.promise;
  });
  expect(f.mutations.getSnapshot().busy).toBe(true);
  await expect(f.mutations.run(async () => {})).rejects.toThrow();
  const failed = expect(reset).rejects.toThrow("synthetic reset failure");
  gate.reject(new Error("synthetic reset failure"));
  await failed;
  expect(f.mutations.getSnapshot()).toMatchObject({
    busy: false,
    quarantined: true,
  });
  expect(f.clerk.session?.id).toBe("b");
  expect(f.clerk.client.signUp.status).toBe("complete");
  expect(f.calls.some((path) => path.endsWith("/remove"))).toBe(false);
  await f.mutations.reselect();
  expect(f.clerk.session?.id).toBe("b");
  f.off();
});
