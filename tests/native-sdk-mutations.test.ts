import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  nativeClerkHarness,
  deferred,
} from "./fixtures/native-clerk-harness.js";
import { IdentityMutations } from "../apps/mobile/src/features/identity/mutations.js";
import { NativeIdentityController } from "../apps/mobile/src/features/identity/controller.js";
import {
  removeOriginalSession,
  sessionActor,
} from "../apps/mobile/src/features/identity/provider-session.js";
beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
async function fixture() {
  const sdk = await nativeClerkHarness(),
    clerk = sdk.clerk;
  const reads = vi.fn(async () => {
    throw { status: 401 };
  });
  const controller = new NativeIdentityController({
    readMe: reads,
    readDeadline: async () => {
      throw Error();
    },
    recordActivity: async () => {
      throw Error();
    },
  });
  await controller.identify(sessionActor(clerk.session));
  const mutations = new IdentityMutations({
    current: () => clerk.session,
    find: (id) => clerk.client.signedInSessions.find((s) => s.id === id),
    select: (id) => clerk.setActive({ session: id }),
    block: () => controller.blockMutations(),
    settle: () => controller.settleMutation(sessionActor(clerk.session)),
  });
  const unsubscribe = clerk.addListener(({ session }) => {
    mutations.observe(session);
    if (
      !mutations.getSnapshot().busy &&
      !mutations.getSnapshot().quarantined &&
      session !== undefined
    )
      void controller.identify(sessionActor(session));
  });
  return {
    ...sdk,
    mutations,
    controller,
    reads,
    close: () => {
      unsubscribe();
      controller.dispose();
    },
  };
}
async function until(check: () => boolean) {
  for (let i = 0; i < 100 && !check(); i++) await Promise.resolve();
  expect(check()).toBe(true);
}
it("removes only captured A when B becomes sole current inside actual SDK removal", async () => {
  const f = await fixture(),
    a = f.clerk.session;
  expect(a?.id).toBe("a");
  if (!a) throw Error();
  const delay = deferred<void>();
  f.delays.set("/v1/client/sessions/a/remove", delay.promise);
  const pending = f.mutations.run(
    (scope) => scope.activate(null, () => removeOriginalSession(a)),
    "session",
  );
  await until(() => f.calls.includes("/v1/client/sessions/a/remove"));
  await f.clerk.setActive({ session: "b" });
  f.statuses.set("a", "removed");
  delay.resolve();
  await pending;
  expect(f.calls.filter((path) => path.endsWith("/remove"))).toEqual([
    "/v1/client/sessions/a/remove",
  ]);
  expect(f.statuses.get("b")).toBe("active");
  expect(f.mutations.getSnapshot().quarantined).toBe(true);
  f.close();
});
it("quarantines actual SDK A activation when B arrives during token await, then revalidates explicit B", async () => {
  const f = await fixture();
  await f.clerk.setActive({ session: null });
  const delay = deferred<void>();
  f.delays.set("/v1/client/sessions/a/tokens", delay.promise);
  const before = f.reads.mock.calls.length;
  const pending = f.mutations.run(
    (scope) => scope.activate("a", () => f.clerk.setActive({ session: "a" })),
    "session",
  );
  await until(() => f.calls.includes("/v1/client/sessions/a/tokens"));
  await f.clerk.setActive({ session: "b" });
  await f.controller.refresh();
  await f.controller.foreground();
  await f.controller.identify("user_b:b");
  expect(f.reads).toHaveBeenCalledTimes(before);
  delay.resolve();
  await pending;
  expect(f.clerk.session?.id).toBe("a");
  expect(f.mutations.getSnapshot()).toMatchObject({
    busy: false,
    quarantined: true,
  });
  expect(f.reads).toHaveBeenCalledTimes(before);
  await f.mutations.reselect();
  expect(f.clerk.session?.id).toBe("b");
  expect(f.mutations.getSnapshot().quarantined).toBe(false);
  expect(f.controller.getSnapshot()).toEqual({
    kind: "locked",
    reason: "expired",
  });
  f.close();
});
it("keeps C quarantined when it changes during explicit B settlement, with no automatic loop", async () => {
  const f = await fixture(),
    gate = deferred<void>();
  const held = f.mutations.run(async () => {
    await gate.promise;
  }, "session");
  await f.clerk.setActive({ session: "b" });
  gate.resolve();
  await held;
  const delay = deferred<void>();
  f.delays.set("/v1/client/sessions/b/touch", delay.promise);
  const selecting = f.mutations.reselect();
  await until(
    () =>
      f.calls.filter((path) => path === "/v1/client/sessions/b/touch")
        .length === 2,
  );
  await f.clerk.setActive({ session: "c" });
  delay.resolve();
  await selecting;
  expect(f.mutations.getSnapshot().quarantined).toBe(true);
  expect(f.clerk.session?.id).toBe("b");
  const count = f.calls.length;
  await vi.advanceTimersByTimeAsync(16000);
  expect(f.calls).toHaveLength(count);
  f.close();
});
it("retains its lock on a hung SDK request and timeout, rejecting a remounted attempt", async () => {
  const f = await fixture(),
    delay = deferred<void>();
  f.delays.set("/v1/client/sessions/a/touch", delay.promise);
  const pending = f.mutations.run(
    (scope) => scope.activate("a", () => f.clerk.setActive({ session: "a" })),
    "session",
  );
  await until(() => f.calls.includes("/v1/client/sessions/a/touch"));
  await vi.advanceTimersByTimeAsync(15000);
  expect(f.mutations.getSnapshot()).toMatchObject({ busy: true, slow: true });
  const newer = vi.fn(async () => {});
  await expect(f.mutations.run(newer)).rejects.toThrow();
  expect(newer).not.toHaveBeenCalled();
  f.controller.background();
  delay.resolve();
  await pending;
  expect(f.controller.getSnapshot()).toEqual({
    kind: "locked",
    reason: "background",
  });
  f.close();
});
it("requires explicit recovery when an activation target disappears or fails", async () => {
  const f = await fixture();
  await expect(
    f.mutations.run((scope) => scope.activate("missing", async () => {})),
  ).rejects.toThrow();
  expect(f.mutations.getSnapshot().quarantined).toBe(true);
  await expect(f.mutations.reselect()).rejects.toThrow();
  await f.mutations.reselect(true);
  expect(f.clerk.session).toBeNull();
  f.close();
});

it("keeps failed SDK activation quarantined and never revives a revoked target", async () => {
  const f = await fixture();
  f.failures.set("/v1/client/sessions/b/touch", 403);
  await expect(
    f.mutations.run((scope) =>
      scope.activate("b", () => f.clerk.setActive({ session: "b" })),
    ),
  ).rejects.toThrow();
  expect(f.mutations.getSnapshot().quarantined).toBe(true);
  f.statuses.set("b", "removed");
  await f.clerk.client.reload();
  await expect(f.mutations.reselect()).rejects.toThrow();
  expect(f.controller.getSnapshot().kind).toBe("locked");
  f.close();
});
