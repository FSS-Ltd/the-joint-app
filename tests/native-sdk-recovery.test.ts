import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  nativeClerkHarness,
  deferred,
} from "./fixtures/native-clerk-harness.js";
import { sdkSessionActions } from "./fixtures/sdk-session-actions.js";
import { IdentityMutations } from "../apps/mobile/src/features/identity/mutations.js";
import { NativeIdentityController } from "../apps/mobile/src/features/identity/controller.js";
import { sessionActor } from "../apps/mobile/src/features/identity/provider-session.js";
beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
async function fixture(status: number) {
  const f = await nativeClerkHarness();
  f.failures.set("/v1/client/sessions/a/tokens", status);
  const controller = new NativeIdentityController({
    readMe: async () => {
      throw { status: 503 };
    },
    readDeadline: async () => {
      throw Error();
    },
    recordActivity: async () => {
      throw Error();
    },
  });
  await controller.identify(sessionActor(f.clerk.session));
  const mutations = new IdentityMutations({
    current: () => f.clerk.session,
    find: (id) => f.clerk.client.signedInSessions.find((s) => s.id === id),
    select: (id) => f.clerk.setActive({ session: id }),
    block: () => controller.blockMutations(),
    settle: () => controller.settleMutation(sessionActor(f.clerk.session)),
  });
  const off = f.clerk.addListener(({ session }) => mutations.observe(session));
  const actions = await sdkSessionActions(f.clerk, controller, mutations);
  return {
    ...f,
    actions,
    controller,
    mutations,
    close: () => {
      off();
      actions.unmount();
      controller.dispose();
    },
  };
}
it.each([401, 403, 404])(
  "offers explicit local recovery after actual SDK getToken %i keeps its session",
  async (status) => {
    const f = await fixture(status);
    await expect(
      f.actions.api.readMe(new AbortController().signal),
    ).rejects.toMatchObject({ status: 401 });
    await f.actions.render().logout("local");
    expect(f.actions.send).not.toHaveBeenCalled();
    expect(f.clerk.session?.id).toBe("a");
    expect(f.actions.render().discardRejectedSignIn).toBeTypeOf("function");
    await f.actions.render().discardRejectedSignIn?.();
    expect(f.calls.filter((p) => p.endsWith("/remove"))).toEqual([
      "/v1/client/sessions/a/remove",
    ]);
    expect(f.actions.render().sessionNotice).toContain(
      "could not be confirmed",
    );
    f.close();
  },
);
it("keeps a safe explicit restart when actual SDK 401 clears its own session", async () => {
  const f = await fixture(401);
  f.statuses.set("a", "removed");
  await f.actions.render().logout("local");
  expect(f.clerk.session).toBeNull();
  expect(f.mutations.getSnapshot().quarantined).toBe(true);
  await f.mutations.restart(async () => {
    await f.clerk.client.signIn.__internal_future.reset();
    await f.clerk.client.signUp.__internal_future.reset();
  });
  expect(f.controller.getSnapshot()).toEqual({ kind: "signed-out" });
  expect(f.mutations.getSnapshot().notice).toContain("could not be confirmed");
  f.close();
});
it("does not allow local discard after transient SDK 503", async () => {
  const f = await fixture(503);
  const action = f.actions.render().logout("local");
  await vi.advanceTimersByTimeAsync(120000);
  await action;
  expect(f.actions.render().discardRejectedSignIn).toBeUndefined();
  expect(f.calls.some((p) => p.endsWith("/remove"))).toBe(false);
  f.close();
});
it("keeps the real SDK token acquisition locked after the app API timeout", async () => {
  const f = await fixture(403),
    gate = deferred<void>();
  f.delays.set("/v1/client/sessions/a/tokens", gate.promise);
  const action = f.actions.render().logout("local");
  await vi.advanceTimersByTimeAsync(15000);
  expect(f.mutations.getSnapshot()).toMatchObject({ busy: true, slow: true });
  const attempt = vi.fn(async () => {});
  await expect(f.mutations.run(attempt)).rejects.toThrow();
  expect(attempt).not.toHaveBeenCalled();
  await f.clerk.setActive({ session: "b" });
  gate.resolve();
  await action;
  expect(f.mutations.getSnapshot().quarantined).toBe(true);
  expect(f.clerk.session?.id).toBe("b");
  expect(f.calls.some((p) => p.endsWith("/remove"))).toBe(false);
  f.close();
});

it.each(["not_found", "configuration_not_found"])(
  "keeps unrelated actual SDK404 %s unconfirmed",
  async (code) => {
    const f = await fixture(404);
    f.errorCodes.set("/v1/client/sessions/a/tokens", code);
    await expect(
      f.actions.api.readMe(new AbortController().signal),
    ).rejects.toMatchObject({ status: 0 });
    await f.actions.render().logout("local");
    expect(f.actions.render().discardRejectedSignIn).toBeUndefined();
    expect(f.calls.some((path) => path.endsWith("/remove"))).toBe(false);
    f.close();
  },
);
