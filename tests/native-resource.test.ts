import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  NativeResourceController,
  NativeApiError,
} from "./fixtures/native-events.js";
import {
  nativeWire,
  scope,
  flush,
  deferred,
} from "./fixtures/native-stream.js";
import type { NativeResourceScope } from "../apps/mobile/src/events/scope.js";
import { resourceFixture as setup } from "./fixtures/native-resource.js";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());
const changed = "event: change\ndata: {}\n\n";

it("subscribes before startup read, remains idle on keepalives and ignores duplicate starts", async () => {
  const test = setup();
  test.controller.start();
  test.controller.start();
  test.controller.foreground();
  await flush();
  expect(test.send).toHaveBeenCalledOnce();
  expect(test.read).not.toHaveBeenCalled();
  test.emit(changed);
  await flush();
  expect(test.read).toHaveBeenCalledWith(scope, expect.any(AbortSignal));
  expect(test.receive).toHaveBeenCalledWith("value");
  for (let count = 0; count < 8; count++) {
    await vi.advanceTimersByTimeAsync(15000);
    test.emit(": keepalive\n\n");
    await flush();
  }
  expect(test.send).toHaveBeenCalledOnce();
  expect(test.read).toHaveBeenCalledOnce();
  test.controller.close();
  expect(vi.getTimerCount()).toBe(0);
});

it("coalesces duplicate hints and never republishes a read invalidated while in flight", async () => {
  const first = deferred<string>(),
    next = deferred<string>();
  const read = vi
    .fn<(scope: NativeResourceScope, signal: AbortSignal) => Promise<string>>()
    .mockReturnValueOnce(first.promise)
    .mockReturnValueOnce(next.promise);
  const test = setup(read);
  test.controller.start();
  await flush();
  test.emit(changed);
  await flush();
  test.emit(changed + changed);
  await flush();
  expect(read).toHaveBeenCalledOnce();
  first.resolve("obsolete");
  await flush();
  expect(test.receive).not.toHaveBeenCalled();
  expect(read).toHaveBeenCalledTimes(2);
  next.resolve("fresh");
  await flush();
  expect(test.receive.mock.calls).toEqual([["fresh"]]);
  test.controller.close();
});

it("conceals synchronously on background and leaves no pending read, stream or retry wakeup", async () => {
  const result = deferred<string>(),
    test = setup(vi.fn(() => result.promise));
  test.controller.start();
  await flush();
  test.emit(changed);
  await flush();
  test.unavailable.mockClear();
  test.controller.background();
  expect(test.unavailable).toHaveBeenCalledOnce();
  expect(test.read.mock.calls[0]?.[1].aborted).toBe(true);
  expect(test.connections[0]?.signal.aborted).toBe(true);
  expect(vi.getTimerCount()).toBe(0);
  result.resolve("old");
  await flush();
  await vi.advanceTimersByTimeAsync(300000);
  expect(test.receive).not.toHaveBeenCalled();
  expect(test.send).toHaveBeenCalledOnce();
  test.controller.foreground();
  test.controller.foreground();
  await flush();
  expect(test.send).toHaveBeenCalledTimes(2);
  expect(test.read).toHaveBeenCalledOnce();
  test.emit(changed);
  await flush();
  expect(test.read).toHaveBeenCalledTimes(2);
  test.controller.close();
});

it.each([
  "actor",
  "userId",
  "membershipId",
  "householdId",
  "grantVersion",
] as const)(
  "fences old %s authority and passes the replacement scope to reads",
  async (key) => {
    const first = deferred<string>(),
      test = setup(
        vi.fn().mockReturnValueOnce(first.promise).mockResolvedValue("new"),
      );
    test.controller.start();
    await flush();
    test.emit(changed);
    await flush();
    const replacement = { ...scope, selector: { ...scope.selector } };
    if (key === "grantVersion") replacement.grantVersion = 1;
    else if (key === "actor")
      replacement.actor = "another-user:another-session";
    else replacement[key] = "00000000-0000-4000-8000-000000000004";
    if (key === "householdId")
      replacement.selector.householdId = replacement.householdId;
    test.unavailable.mockClear();
    test.controller.replaceAuthority(replacement);
    expect(test.unavailable).toHaveBeenCalledOnce();
    expect(test.connections[0]?.signal.aborted).toBe(true);
    first.resolve("old");
    await flush();
    expect(test.receive).not.toHaveBeenCalled();
    test.emit(changed);
    await flush();
    expect(test.read).toHaveBeenLastCalledWith(
      replacement,
      expect.any(AbortSignal),
    );
    expect(test.receive.mock.calls).toEqual([["new"]]);
    test.controller.replaceAuthority({ ...replacement });
    await flush();
    expect(test.send).toHaveBeenCalledTimes(2);
    test.controller.close();
  },
);

it.each([401, 403, 404])(
  "makes resource %i terminal; only 401 revokes the captured actor",
  async (status) => {
    const test = setup(
      vi.fn(async () => {
        throw new NativeApiError(status);
      }),
    );
    test.controller.start();
    await flush();
    test.emit(changed);
    await flush();
    expect(test.failure).toHaveBeenCalledWith(
      expect.objectContaining({ status }),
    );
    expect(test.revoke.mock.calls).toEqual(
      status === 401 ? [[scope.actor]] : [],
    );
    expect(vi.getTimerCount()).toBe(0);
    test.controller.start();
    test.controller.background();
    test.controller.foreground();
    test.controller.replaceAuthority({ ...scope });
    await vi.advanceTimersByTimeAsync(100000);
    expect(test.send).toHaveBeenCalledOnce();
    test.controller.retry();
    await flush();
    expect(test.send).toHaveBeenCalledTimes(2);
    test.controller.close();
  },
);

it("ignores a captured old actor's late 401 and a late token after authority replacement", async () => {
  const old = deferred<string>(),
    test = setup(
      vi.fn().mockReturnValueOnce(old.promise).mockResolvedValue("new"),
    );
  test.controller.start();
  await flush();
  test.emit(changed);
  await flush();
  test.controller.replaceAuthority({ ...scope, actor: "new:session" });
  old.reject(new NativeApiError(401));
  await flush();
  expect(test.revoke).not.toHaveBeenCalled();
  expect(test.failure).not.toHaveBeenCalled();
  test.controller.close();
  const token = deferred<string>(),
    wire = nativeWire(() => token.promise);
  const controller = new NativeResourceController({
    scope,
    transport: wire.transport,
    read: test.read,
    receive: test.receive,
    unavailable: test.unavailable,
    failure: test.failure,
    revoke: test.revoke,
  });
  controller.start();
  controller.replaceAuthority(null);
  token.resolve("old-token");
  await flush();
  expect(wire.send).not.toHaveBeenCalled();
  expect(vi.getTimerCount()).toBe(0);
  controller.close();
});

it("clears visible state before refresh and treats invalidate as terminal resource loss", async () => {
  const test = setup();
  let visible: string | null = null;
  test.receive.mockImplementation((value) => {
    visible = value;
  });
  test.unavailable.mockImplementation(() => {
    visible = null;
  });
  test.controller.start();
  await flush();
  test.emit(changed);
  await flush();
  expect(visible).toBe("value");
  test.emit(changed);
  await Promise.resolve();
  await Promise.resolve();
  // The read dependency observes concealment, even when it resolves synchronously.
  test.read.mockImplementation(async () => {
    expect(visible).toBeNull();
    return "fresh";
  });
  await flush();
  test.emit(changed);
  await flush();
  test.emit("event: invalidate\ndata: {}\n\n" + changed);
  await flush();
  expect(visible).toBeNull();
  expect(test.failure).toHaveBeenCalledWith(
    expect.objectContaining({ status: 404 }),
  );
  expect(test.revoke).not.toHaveBeenCalled();
  expect(vi.getTimerCount()).toBe(0);
  test.controller.close();
});

it("rejects a mismatched household scope before opening a stream", () => {
  const wire = nativeWire();
  expect(
    () =>
      new NativeResourceController({
        scope: {
          ...scope,
          householdId: "00000000-0000-4000-8000-000000000005",
        },
        transport: wire.transport,
        read: vi.fn(),
        receive: vi.fn(),
        unavailable: vi.fn(),
        failure: vi.fn(),
        revoke: vi.fn(),
      }),
  ).toThrow();
  expect(wire.send).not.toHaveBeenCalled();
});

it("captures caller scope bytes and re-subscribes when the selected page changes", async () => {
  const test = setup();
  test.controller.start();
  await flush();
  const replacement = { ...scope, selector: { ...scope.selector, limit: 10 } };
  test.controller.replaceAuthority(replacement);
  replacement.selector.limit = 1;
  replacement.actor = "mutated:session";
  await flush();
  test.emit(changed);
  await flush();
  expect(test.read).toHaveBeenLastCalledWith(
    expect.objectContaining({
      actor: scope.actor,
      selector: expect.objectContaining({ limit: 10 }),
    }),
    expect.any(AbortSignal),
  );
  expect(test.send.mock.calls[1]?.[0]).toContain("limit=10");
  test.controller.close();
});
