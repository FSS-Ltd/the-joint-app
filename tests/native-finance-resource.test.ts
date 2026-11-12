import type { NativeResourceScope } from "../apps/mobile/src/events/scope.js";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { financeFixture } from "./fixtures/native-finance.js";
import { deferred, flush, scope } from "./fixtures/native-stream.js";
import { NativeApiError } from "../apps/mobile/src/api/errors.js";
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(0);
});
afterEach(() => vi.useRealTimers());
it("subscribes before reading, coalesces hints and makes zero idle calls", async () => {
  const f = await financeFixture();
  const read = vi.fn(async () => "authorized");
  const render = () => f.h.render(() => f.resource(scope.selector, read));
  expect(render().kind).toBe("loading");
  await flush();
  expect(read).not.toHaveBeenCalled();
  f.emit("event: change\ndata: {}\n\n");
  await flush();
  expect(render()).toMatchObject({ kind: "ready", value: "authorized" });
  for (let i = 0; i < 30; i++) {
    f.emit(": keepalive\n\n");
    await vi.advanceTimersByTimeAsync(10000);
  }
  expect(read).toHaveBeenCalledOnce();
  expect(f.send).toHaveBeenCalledOnce();
  f.close();
  expect(f.h.listeners()).toBe(0);
  expect(vi.getTimerCount()).toBe(0);
});
it("hints only an in-place refresh while keeping current values concealed", async () => {
  const f = await financeFixture();
  const pending = deferred<string>();
  const read = vi
    .fn()
    .mockResolvedValueOnce("first")
    .mockReturnValueOnce(pending.promise);
  const render = () =>
    f.h.render(() =>
      f.resource(scope.selector, read, { preserveRefreshHint: true }),
    );
  expect(render()).toMatchObject({ kind: "loading" });
  await flush();
  f.emit("event: change\ndata: {}\n\n");
  await flush();
  expect(render()).toMatchObject({ kind: "ready", value: "first" });
  f.emit("event: change\ndata: {}\n\n");
  await flush();
  const refreshing = render();
  expect(refreshing).toMatchObject({ kind: "loading", refreshing: true });
  expect(refreshing.current()).toBeNull();
  pending.resolve("second");
  await flush();
  expect(render()).toMatchObject({ kind: "ready", value: "second" });
  f.connections[0]?.wire.close();
  await flush();
  expect(render()).toMatchObject({ kind: "loading" });
  expect(render()).not.toHaveProperty("refreshing");
  expect(render().current()).toBeNull();
  f.close();
});
it("preserves only the refresh hint across an explicit renewal and replacement read", async () => {
  const f = await financeFixture();
  const pending = deferred<string>();
  const read = vi
    .fn()
    .mockResolvedValueOnce("first")
    .mockReturnValueOnce(pending.promise);
  const render = () =>
    f.h.render(() =>
      f.resource(scope.selector, read, { preserveRefreshHint: true }),
    );
  render();
  await flush();
  f.emit("event: change\ndata: {}\n\n");
  await flush();
  expect(render()).toMatchObject({ kind: "ready", value: "first" });
  f.emit("event: renew\ndata: {}\n\n");
  await flush();
  expect(render()).toMatchObject({ kind: "loading", refreshing: true });
  expect(render().current()).toBeNull();
  await vi.advanceTimersByTimeAsync(1000);
  expect(f.send).toHaveBeenCalledTimes(2);
  f.emit("event: change\ndata: {}\n\n");
  await flush();
  expect(render()).toMatchObject({ kind: "loading", refreshing: true });
  expect(render().current()).toBeNull();
  pending.resolve("second");
  await flush();
  expect(render()).toMatchObject({ kind: "ready", value: "second" });
  f.emit("event: reconnect\ndata: {}\n\n");
  await flush();
  expect(render()).toMatchObject({ kind: "loading" });
  expect(render()).not.toHaveProperty("refreshing");
  f.close();
});
it("clears a renewal hint if the replacement stream fails", async () => {
  const f = await financeFixture();
  const read = vi.fn(async () => "first");
  const render = () =>
    f.h.render(() =>
      f.resource(scope.selector, read, { preserveRefreshHint: true }),
    );
  render();
  await flush();
  f.emit("event: change\ndata: {}\n\n");
  await flush();
  f.emit("event: renew\ndata: {}\n\n");
  await flush();
  expect(render()).toMatchObject({ kind: "loading", refreshing: true });
  await vi.advanceTimersByTimeAsync(1000);
  f.connections[1]?.wire.close();
  await flush();
  expect(render()).toMatchObject({ kind: "loading" });
  expect(render()).not.toHaveProperty("refreshing");
  expect(render().current()).toBeNull();
  f.close();
});
it.each(["identity", "blur", "background"])(
  "aborts immediately on %s loss and fences late reads",
  async (loss) => {
    const f = await financeFixture();
    const pending = deferred<string>();
    const read = vi.fn<
      (scope: NativeResourceScope, signal: AbortSignal) => Promise<string>
    >(() => pending.promise);
    const render = () => f.h.render(() => f.resource(scope.selector, read));
    render();
    await flush();
    f.emit("event: change\ndata: {}\n\n");
    await flush();
    if (loss === "identity") f.controller.blockMutations();
    if (loss === "blur") f.h.focus(false);
    if (loss === "background") f.h.app("background");
    expect(read.mock.calls[0]?.[1].aborted).toBe(true);
    pending.resolve("private old result");
    await flush();
    expect(render().kind).toBe("loading");
    f.close();
  },
);
it.each([403, 404])(
  "reconciles resource %i once without retrying an obsolete cursor",
  async (status) => {
    const f = await financeFixture();
    f.issueCursor("old-cursor");
    const read = vi.fn(async () => {
      throw new NativeApiError(status);
    });
    const render = () =>
      f.h.render(() =>
        f.resource({ ...scope.selector, cursor: "old-cursor" }, read),
      );
    render();
    await flush();
    f.emit("event: change\ndata: {}\n\n");
    await flush();
    expect(f.api.readMe).toHaveBeenCalledTimes(2);
    expect(f.send).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(10000);
    expect(read).toHaveBeenCalledOnce();
    expect(f.controller.getSnapshot().kind).toBe("ready");
    f.close();
  },
);
it("fences old resources before explicit sharing success refreshes identity", async () => {
  const f = await financeFixture();
  const pending = deferred<string>();
  const read = vi.fn<
    (scope: NativeResourceScope, signal: AbortSignal) => Promise<string>
  >(() => pending.promise);
  f.h.render(() => f.resource(scope.selector, read));
  await flush();
  f.emit("event: change\ndata: {}\n\n");
  await flush();
  const reconcile = f.finance.reconcile(f.finance.authority);
  expect(read.mock.calls[0]?.[1].aborted).toBe(true);
  pending.resolve("old-grant");
  await reconcile;
  await flush();
  expect(f.h.render(() => f.resource(scope.selector, read)).kind).toBe(
    "loading",
  );
  f.close();
});
it("coalesces committed hints and never publishes an intermediate read", async () => {
  const f = await financeFixture();
  const first = deferred<string>();
  const read = vi
    .fn(async () => "fresh")
    .mockImplementationOnce(() => first.promise);
  const render = () => f.h.render(() => f.resource(scope.selector, read));
  render();
  await flush();
  f.emit("event: change\ndata: {}\n\n");
  await flush();
  f.emit("event: change\ndata: {}\n\nevent: change\ndata: {}\n\n");
  await flush();
  expect(read).toHaveBeenCalledOnce();
  first.resolve("stale");
  await flush();
  expect(read).toHaveBeenCalledTimes(2);
  expect(render()).toMatchObject({ kind: "ready", value: "fresh" });
  f.close();
});
it.each(["provider", "household", "grant"])(
  "synchronously fences %s authority replacement before a React effect",
  async (replacement) => {
    const f = await financeFixture();
    const pending = deferred<string>();
    const read = vi.fn<
      (scope: NativeResourceScope, signal: AbortSignal) => Promise<string>
    >(() => pending.promise);
    const render = () => f.h.render(() => f.resource(scope.selector, read));
    render();
    await flush();
    f.emit("event: change\ndata: {}\n\n");
    await flush();
    const original = await f.api.readMe();
    if (replacement !== "provider")
      f.api.readMe.mockResolvedValue({
        ...original,
        membership: original.membership && {
          ...original.membership,
          ...(replacement === "grant"
            ? { grantVersion: 1 }
            : { householdId: "00000000-0000-4000-8000-000000000099" }),
        },
      });
    const changed =
      replacement === "provider"
        ? f.controller.identify("new:session")
        : f.controller.refresh();
    expect(read.mock.calls[0]?.[1].aborted).toBe(true);
    pending.resolve("obsolete");
    await changed;
    await flush();
    expect(render().kind).toBe("loading");
    f.close();
  },
);
it("masks changed account and page keys before cleanup and aborts old target after commit", async () => {
  const f = await financeFixture();
  const pending = deferred<string>();
  const read = vi.fn<
    (scope: NativeResourceScope, signal: AbortSignal) => Promise<string>
  >(() => pending.promise);
  const account = {
    kind: "account",
    householdId: scope.householdId,
    id: "00000000-0000-4000-8000-000000000008",
  } as const;
  f.h.render(() => f.resource(account, read));
  await flush();
  f.emit("event: change\ndata: {}\n\n");
  await flush();
  const next = { ...account, id: "00000000-0000-4000-8000-000000000009" };
  expect(f.h.render(() => f.resource(next, read), false).kind).toBe("loading");
  f.h.render(() => f.resource(next, read));
  expect(read.mock.calls[0]?.[1].aborted).toBe(true);
  pending.resolve("old account");
  await flush();
  expect(f.h.render(() => f.resource(next, read)).kind).toBe("loading");
  f.close();
});
it("rejects mismatched account DTO identifiers without showing upstream data", async () => {
  const f = await financeFixture();
  const account = {
    kind: "account",
    householdId: scope.householdId,
    id: "00000000-0000-4000-8000-000000000008",
  } as const;
  const render = () =>
    f.h.render(() =>
      f.resource(account, async () => ({
        householdId: scope.householdId,
        id: "wrong",
      })),
    );
  render();
  await flush();
  f.emit("event: change\ndata: {}\n\n");
  await flush();
  expect(render()).toMatchObject({ kind: "error" });
  expect(render()).not.toHaveProperty("value");
  expect(f.api.readMe).toHaveBeenCalledOnce();
  f.close();
});
it("reconciles a wealth grant epoch mismatch once before it can paint", async () => {
  const f = await financeFixture();
  const read = vi.fn(async () => ({
    householdId: scope.householdId,
    scope: { grantVersion: 2 },
  }));
  const selector = { kind: "wealth", householdId: scope.householdId } as const;
  const render = () => f.h.render(() => f.resource(selector, read));
  render();
  await flush();
  f.emit("event: change\ndata: {}\n\n");
  await flush();
  expect(f.api.readMe).toHaveBeenCalledTimes(2);
  expect(render().kind).toBe("loading");
  expect(read).toHaveBeenCalledOnce();
  f.close();
});
it("revokes only the captured actor for a current401", async () => {
  const f = await financeFixture();
  f.h.render(() =>
    f.resource(scope.selector, async () => {
      throw new NativeApiError(401);
    }),
  );
  await flush();
  f.emit("event: change\ndata: {}\n\n");
  await flush();
  expect(f.controller.getSnapshot()).toEqual({
    kind: "locked",
    reason: "expired",
  });
  f.close();
});
it("does not reopen a denied old cursor after identity reconciliation rerenders the provider", async () => {
  const f = await financeFixture();
  const read = vi.fn(async () => {
    throw new NativeApiError(403);
  });
  f.issueCursor("obsolete");
  const selector = { ...scope.selector, cursor: "obsolete" };
  const render = () => f.h.render(() => f.resource(selector, read));
  render();
  await flush();
  f.emit("event: change\ndata: {}\n\n");
  await flush();
  const verified = f.controller.getVerifiedIdentity();
  if (!verified) throw Error("Expected refreshed identity");
  const value = f.renderProvider(verified.me);
  if (!value.authority) throw Error("Expected ready finance authority");
  f.replaceFinance({ ...value, authority: value.authority });
  // A new provider value must not automatically reopen the refused cursor.
  render();
  await flush();
  expect(f.send).toHaveBeenCalledOnce();
  expect(f.api.readMe).toHaveBeenCalledTimes(2);
  f.close();
});
it("synchronously aborts pending resource work when the identity controller is disposed", async () => {
  const f = await financeFixture();
  const read = vi.fn<
    (scope: NativeResourceScope, signal: AbortSignal) => Promise<string>
  >(() => new Promise<string>(() => {}));
  f.h.render(() => f.resource(scope.selector, read));
  await flush();
  f.emit("event: change\ndata: {}\n\n");
  await flush();
  f.controller.dispose();
  expect(read.mock.calls[0]?.[1].aborted).toBe(true);
  f.close();
});
it("rejects selected wealth identifiers outside the captured selection", async () => {
  const f = await financeFixture();
  const id = "00000000-0000-4000-8000-000000000008";
  const selector = {
    kind: "wealth",
    householdId: scope.householdId,
    accountIds: id,
  } as const;
  const render = () =>
    f.h.render(() =>
      f.resource(selector, async () => ({
        householdId: scope.householdId,
        scope: {
          grantVersion: 0,
          accountIds: ["00000000-0000-4000-8000-000000000009"],
        },
      })),
    );
  render();
  await flush();
  f.emit("event: change\ndata: {}\n\n");
  await flush();
  expect(render()).toMatchObject({ kind: "error" });
  expect(render()).not.toHaveProperty("value");
  f.close();
});
it("never dispatches a stream after its token finishes behind background cancellation", async () => {
  const token = deferred<string>();
  const f = await financeFixture(() => token.promise);
  const read = vi.fn(async () => "unused");
  f.h.render(() => f.resource(scope.selector, read));
  f.h.app("background");
  token.resolve("late-token");
  await flush();
  expect(f.send).not.toHaveBeenCalled();
  expect(read).not.toHaveBeenCalled();
  f.close();
  expect(vi.getTimerCount()).toBe(0);
});
it.each(["blur", "background"])(
  "freshly subscribes after %s return without replaying old results",
  async (loss) => {
    const f = await financeFixture();
    const read = vi.fn(async () => "fresh");
    const render = () => f.h.render(() => f.resource(scope.selector, read));
    render();
    await flush();
    f.emit("event: change\ndata: {}\n\n");
    await flush();
    expect(render().kind).toBe("ready");
    if (loss === "blur") f.h.focus(false);
    else f.h.app("background");
    expect(render().kind).toBe("loading");
    if (loss === "blur") f.h.focus(true);
    else f.h.app("active");
    await flush();
    expect(f.send).toHaveBeenCalledTimes(2);
    expect(render().kind).toBe("loading");
    f.emit("event: change\ndata: {}\n\n");
    await flush();
    expect(read).toHaveBeenCalledTimes(2);
    expect(render().kind).toBe("ready");
    f.close();
  },
);
it("does not reuse an old page cursor after grant authority changes", async () => {
  const f = await financeFixture();
  const read = vi.fn(async () => "value");
  f.issueCursor("captured-under-old-grant");
  const page = { ...scope.selector, cursor: "captured-under-old-grant" };
  f.h.render(() => f.resource(page, read));
  await flush();
  const original = f.controller.getVerifiedIdentity()!.me;
  f.api.readMe.mockResolvedValue({
    ...original,
    membership: original.membership && {
      ...original.membership,
      grantVersion: 1,
    },
  });
  await f.finance.reconcile(f.finance.authority);
  const value = f.renderProvider(f.controller.getVerifiedIdentity()!.me);
  if (!value.authority) throw Error("Expected refreshed authority");
  f.replaceFinance({ ...value, authority: value.authority });
  f.h.render(() => f.resource(page, read));
  expect(f.h.render(() => f.resource(page, read))).toMatchObject({
    kind: "error",
  });
  await flush();
  expect(f.send).toHaveBeenCalledOnce();
  f.h.render(() => f.resource(scope.selector, read));
  await flush();
  expect(f.send).toHaveBeenCalledTimes(2);
  f.close();
});
it("does not revoke replacement identity for an earlier read's late401", async () => {
  const f = await financeFixture();
  const pending = deferred<string>();
  f.h.render(() => f.resource(scope.selector, () => pending.promise));
  await flush();
  f.emit("event: change\ndata: {}\n\n");
  await flush();
  await f.controller.identify("replacement:session");
  pending.reject(new NativeApiError(401));
  await flush();
  expect(f.controller.getVerifiedIdentity()?.actor).toBe("replacement:session");
  f.close();
});
it("clears a previous permission refusal after an explicitly retried authorized read succeeds", async () => {
  const f = await financeFixture();
  const read = vi
    .fn(async () => "authorized")
    .mockRejectedValueOnce(new NativeApiError(403));
  const render = () => f.h.render(() => f.resource(scope.selector, read));
  render();
  await flush();
  f.emit("event: change\ndata: {}\n\n");
  await flush();
  const value = f.renderProvider(f.controller.getVerifiedIdentity()!.me);
  if (!value.authority) throw Error("Expected refreshed authority");
  f.replaceFinance({ ...value, authority: value.authority });
  render();
  render().retry();
  await flush();
  f.emit("event: change\ndata: {}\n\n");
  await flush();
  expect(render().kind).toBe("ready");
  f.h.focus(false);
  f.h.focus(true);
  await flush();
  expect(f.send).toHaveBeenCalledTimes(3);
  f.close();
});
