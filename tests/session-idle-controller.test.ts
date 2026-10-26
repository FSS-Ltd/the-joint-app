import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { IdleSessionController } from "../apps/web/components/identity/session/idle-controller.js";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(0);
});
afterEach(() => vi.useRealTimers());
function fixture() {
  const read = vi.fn(async () => ({
    expiresAt: new Date(600_000).toISOString(),
    serverTime: new Date().toISOString(),
  }));
  const activity = vi.fn(async (age: number) => ({
    expiresAt: new Date(Date.now() + 600_000 - age).toISOString(),
    serverTime: new Date().toISOString(),
  }));
  const lock = vi.fn(),
    expire = vi.fn(),
    ready = vi.fn(),
    changed = vi.fn();
  const controller = new IdleSessionController({
    read,
    activity,
    lock,
    expire,
    ready,
    changed,
    unavailable: vi.fn(),
  });
  return { controller, read, activity, lock, expire, ready, changed };
}
it("makes no idle requests until its deadline and locks before checking expiry", async () => {
  const f = fixture();
  await f.controller.start();
  await vi.advanceTimersByTimeAsync(599_999);
  expect(f.read).toHaveBeenCalledTimes(1);
  expect(f.activity).not.toHaveBeenCalled();
  f.read.mockRejectedValueOnce({ status: 401 });
  await vi.advanceTimersByTimeAsync(1);
  expect(f.lock).toHaveBeenCalled();
  expect(f.expire).toHaveBeenCalledOnce();
  f.controller.stop();
});
it("coalesces deliberate activity without an idle heartbeat or late renewal", async () => {
  const f = fixture();
  await f.controller.start();
  f.controller.interact();
  await vi.advanceTimersByTimeAsync(100);
  f.controller.interact();
  await vi.advanceTimersByTimeAsync(4900);
  expect(f.activity).toHaveBeenCalledTimes(2);
  expect(f.activity.mock.calls[1]?.[0]).toBe(4900);
  await vi.advanceTimersByTimeAsync(30_000);
  expect(f.activity).toHaveBeenCalledTimes(2);
  f.controller.stop();
  await vi.advanceTimersByTimeAsync(600_000);
  expect(f.expire).not.toHaveBeenCalled();
});
it("reconciles on restore without counting it as user activity", async () => {
  const f = fixture();
  await f.controller.start();
  await f.controller.reconcile();
  expect(f.read).toHaveBeenCalledTimes(2);
  expect(f.activity).not.toHaveBeenCalled();
  expect(f.lock).toHaveBeenCalled();
  expect(f.ready).toHaveBeenCalled();
  f.controller.stop();
});

it("does not schedule a trailing activity request after unmount during a request", async () => {
  const f = fixture();
  await f.controller.start();
  let finish: (() => void) | undefined;
  f.activity.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = () =>
          resolve({
            expiresAt: new Date(600_000).toISOString(),
            serverTime: new Date().toISOString(),
          });
      }),
  );
  f.controller.interact();
  await vi.advanceTimersByTimeAsync(1);
  f.controller.interact();
  await vi.advanceTimersByTimeAsync(5000);
  f.controller.stop();
  finish?.();
  await vi.advanceTimersByTimeAsync(10_000);
  expect(f.activity).toHaveBeenCalledTimes(1);
  expect(vi.getTimerCount()).toBe(0);
});

it("keeps an active form mounted during reconciliation, but conceals it at its known deadline", async () => {
  const f = fixture();
  await f.controller.start();
  f.lock.mockClear();
  await f.controller.reconcile(false);
  expect(f.lock).not.toHaveBeenCalled();
  vi.setSystemTime(600_000);
  f.read.mockRejectedValueOnce({ status: 401 });
  await f.controller.reconcile(false);
  expect(f.lock).toHaveBeenCalled();
  expect(f.expire).toHaveBeenCalledOnce();
  f.controller.stop();
});
