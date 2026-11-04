import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { IdentityApi } from "../apps/mobile/src/features/identity/api.js";
import { NativeIdentityController } from "../apps/mobile/src/features/identity/controller.js";
import type { MeResponse } from "../packages/contracts/src/identity.js";

const me: MeResponse = {
  user: {
    id: "00000000-0000-4000-8000-000000000001",
    email: "adult@example.test",
  },
  membership: null,
  session: {
    aal: "aal1",
    expiresAt: new Date(600000).toISOString(),
    needsMfa: false,
    mfaVerifiedAt: null,
    purpose: "NORMAL",
  },
  factors: [],
};
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(0);
});
afterEach(() => vi.useRealTimers());
function fixture() {
  const api = {
    readMe: vi.fn<IdentityApi["readMe"]>(async () => me),
    readDeadline: vi.fn<IdentityApi["readDeadline"]>(async () => ({
      expiresAt: new Date(600000).toISOString(),
      serverTime: new Date().toISOString(),
    })),
    recordActivity: vi.fn<IdentityApi["recordActivity"]>(async () => ({
      expiresAt: new Date(Date.now() + 600000).toISOString(),
      serverTime: new Date().toISOString(),
    })),
  };
  const controller = new NativeIdentityController(api);
  return { api, controller };
}
it("waits for hydration and makes zero idle network requests before the deadline", async () => {
  const { api, controller } = fixture();
  expect(controller.getSnapshot()).toEqual({ kind: "loading" });
  expect(api.readMe).not.toHaveBeenCalled();
  await controller.identify("actor:session");
  expect(controller.getSnapshot().kind).toBe("household-required");
  await vi.advanceTimersByTimeAsync(599999);
  expect(api.readMe).toHaveBeenCalledTimes(1);
  expect(api.readDeadline).toHaveBeenCalledTimes(1);
  expect(api.recordActivity).not.toHaveBeenCalled();
  controller.dispose();
});
it("sends bounded genuine activity and immediately masks and aborts on background", async () => {
  const { api, controller } = fixture();
  await controller.identify("actor:session");
  controller.interact();
  await vi.advanceTimersByTimeAsync(1);
  expect(api.recordActivity).toHaveBeenCalledOnce();
  controller.background();
  expect(controller.getSnapshot()).toEqual({
    kind: "locked",
    reason: "background",
  });
  expect(api.readMe.mock.calls[0]?.[0].aborted).toBe(true);
  await vi.advanceTimersByTimeAsync(600000);
  expect(api.readDeadline).toHaveBeenCalledTimes(1);
  api.readDeadline.mockRejectedValueOnce({ status: 401 });
  await controller.foreground();
  expect(controller.getSnapshot()).toEqual({
    kind: "locked",
    reason: "expired",
  });
  expect(api.recordActivity).toHaveBeenCalledOnce();
  controller.dispose();
});
it("fences old actor reads and unsubscribes cleanly", async () => {
  const { api, controller } = fixture();
  let finish: ((value: MeResponse) => void) | undefined;
  api.readMe.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const old = controller.identify("old:session");
  await controller.identify(null);
  finish?.(me);
  await old;
  expect(controller.getSnapshot()).toEqual({ kind: "signed-out" });
  const listener = vi.fn();
  const unsubscribe = controller.subscribe(listener);
  unsubscribe();
  controller.background();
  expect(listener).not.toHaveBeenCalled();
  controller.dispose();
  expect(vi.getTimerCount()).toBe(0);
});
it("does not revive a locally revoked session and clears inaccessible identity", async () => {
  const { api, controller } = fixture();
  await controller.identify("actor:session");
  controller.revoke();
  await controller.identify("actor:session");
  await controller.foreground();
  expect(controller.getSnapshot()).toEqual({
    kind: "locked",
    reason: "expired",
  });
  expect(api.readMe).toHaveBeenCalledTimes(1);
  await controller.identify("new:session");
  expect(controller.getSnapshot().kind).toBe("household-required");
  controller.dispose();
});
it("expires at the authoritative deadline without crediting refresh as activity", async () => {
  const { api, controller } = fixture();
  await controller.identify("actor:session");
  api.readDeadline.mockRejectedValueOnce({ status: 401 });
  await vi.advanceTimersByTimeAsync(600000);
  expect(controller.getSnapshot()).toEqual({
    kind: "locked",
    reason: "expired",
  });
  expect(api.recordActivity).not.toHaveBeenCalled();
  expect(api.readDeadline).toHaveBeenCalledTimes(2);
  controller.dispose();
});
it("requires security for recovery or server MFA and respects actual membership", async () => {
  const { api, controller } = fixture();
  api.readMe.mockResolvedValueOnce({
    ...me,
    session: { ...me.session, needsMfa: true },
  });
  await controller.identify("actor:mfa");
  expect(controller.getSnapshot().kind).toBe("security-required");
  api.readMe.mockResolvedValueOnce({
    ...me,
    session: { ...me.session, purpose: "RECOVERY" },
  });
  await controller.identify("actor:recovery");
  expect(controller.getSnapshot().kind).toBe("security-required");
  api.readMe.mockRejectedValueOnce({ status: 503 });
  await controller.foreground();
  expect(controller.getSnapshot()).toEqual({
    kind: "locked",
    reason: "unavailable",
  });
  controller.dispose();
});
it("aborts a pending read on dispose and cannot paint afterward", async () => {
  const { api, controller } = fixture();
  let resolve: ((value: MeResponse) => void) | undefined;
  api.readMe.mockImplementationOnce(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  const pending = controller.identify("actor:session");
  controller.dispose();
  expect(api.readMe.mock.calls[0]?.[0].aborted).toBe(true);
  resolve?.(me);
  await pending;
  expect(controller.getSnapshot()).toEqual({ kind: "loading" });
  expect(api.readDeadline).not.toHaveBeenCalled();
});
it("a late logout response revokes only its original actor", async () => {
  const { controller } = fixture();
  await controller.identify("old:session");
  await controller.identify("new:session");
  controller.revoke("old:session");
  expect(controller.getSnapshot().kind).toBe("household-required");
  await controller.identify("old:session");
  expect(controller.getSnapshot()).toEqual({
    kind: "locked",
    reason: "expired",
  });
  controller.dispose();
});
it("reconciles after a React effect remount without losing revocation history", async () => {
  const { controller } = fixture();
  await controller.identify("actor:session");
  controller.revoke();
  controller.dispose();
  controller.mount();
  await controller.identify("actor:session");
  expect(controller.getSnapshot()).toEqual({
    kind: "locked",
    reason: "expired",
  });
  await controller.identify("actor:new-session");
  expect(controller.getSnapshot().kind).toBe("household-required");
  controller.dispose();
});
it("blocks every authority entry point during a mutation and rechecks deadline before reveal", async () => {
  const { api, controller } = fixture();
  await controller.identify("actor:a");
  controller.blockMutations();
  const before = api.readMe.mock.calls.length;
  await controller.identify("actor:b");
  await controller.foreground();
  await controller.refresh();
  controller.interact();
  expect(api.readMe).toHaveBeenCalledTimes(before);
  let release: (() => void) | undefined;
  api.readDeadline.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        release = () =>
          resolve({
            serverTime: new Date().toISOString(),
            expiresAt: new Date(600000).toISOString(),
          });
      }),
  );
  const settled = controller.settleMutation("actor:b");
  await Promise.resolve();
  await Promise.resolve();
  expect(controller.getSnapshot().kind).toBe("loading");
  release?.();
  await settled;
  expect(controller.getSnapshot().kind).toBe("household-required");
  controller.dispose();
});
it("keeps a revoked actor denied after mutation settlement", async () => {
  const { api, controller } = fixture();
  await controller.identify("actor:a");
  controller.blockMutations();
  controller.revoke("actor:a");
  await controller.settleMutation("actor:a");
  expect(controller.getSnapshot()).toEqual({
    kind: "locked",
    reason: "expired",
  });
  expect(api.readMe).toHaveBeenCalledTimes(1);
  controller.dispose();
});
it("exposes one stable verified ready pair and clears it before notifying invalidation", async () => {
  const { api, controller } = fixture();
  const getter = controller.getVerifiedIdentity;
  expect(getter()).toBeNull();
  api.readMe.mockResolvedValueOnce({
    ...me,
    membership: {
      id: "00000000-0000-4000-8000-000000000002",
      householdId: "00000000-0000-4000-8000-000000000003",
      role: "ADMIN",
      grantVersion: 4,
      household: {
        id: "00000000-0000-4000-8000-000000000003",
        name: "Home",
        baseCurrency: "GBP",
        timezone: "Europe/London",
        memberCount: 1,
      },
    },
  });
  await controller.identify("provider:session");
  const verified = getter();
  expect(verified?.actor).toBe("provider:session");
  expect(getter()).toBe(verified);
  const observed: unknown[] = [];
  controller.subscribe(() => observed.push(getter()));
  controller.background();
  expect(observed).toEqual([null]);
  controller.dispose();
});
