import { afterEach, expect, it, vi } from "vitest";
import { createWorkerScheduler } from "../apps/worker/src/scheduler.js";

afterEach(() => vi.useRealTimers());

it("reconciles once, then makes no idle reads until notified", async () => {
  vi.useFakeTimers();
  const cycle = vi.fn<() => Promise<number | null>>().mockResolvedValue(null);
  const scheduler = createWorkerScheduler(cycle, { retryMaxMs: 30000 });
  scheduler.wake();
  await vi.advanceTimersByTimeAsync(0);
  expect(cycle).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(600000);
  expect(cycle).toHaveBeenCalledTimes(1);
  scheduler.wake();
  await vi.advanceTimersByTimeAsync(0);
  expect(cycle).toHaveBeenCalledTimes(2);
  await scheduler.close();
});

it("schedules actual due times and coalesces notifications during work", async () => {
  vi.useFakeTimers();
  let finish: ((value: number | null) => void) | undefined;
  const cycle = vi
    .fn<() => Promise<number | null>>()
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    )
    .mockResolvedValueOnce(4500)
    .mockResolvedValue(null);
  const scheduler = createWorkerScheduler(cycle, { retryMaxMs: 30000 });
  scheduler.wake();
  await vi.advanceTimersByTimeAsync(0);
  for (let i = 0; i < 100; i++) scheduler.wake();
  expect(cycle).toHaveBeenCalledTimes(1);
  finish?.(0);
  await vi.advanceTimersByTimeAsync(0);
  expect(cycle).toHaveBeenCalledTimes(2);
  await vi.advanceTimersByTimeAsync(4499);
  expect(cycle).toHaveBeenCalledTimes(2);
  await vi.advanceTimersByTimeAsync(1);
  expect(cycle).toHaveBeenCalledTimes(3);
  await scheduler.close();
});

it("backs off failures safely, resets after success and clears shutdown timers", async () => {
  vi.useFakeTimers();
  const unavailable = vi.fn();
  const cycle = vi
    .fn<() => Promise<number | null>>()
    .mockRejectedValueOnce(new Error("secret"))
    .mockRejectedValueOnce(new Error("secret"))
    .mockResolvedValueOnce(1000)
    .mockRejectedValueOnce(new Error("secret"))
    .mockResolvedValue(null);
  const scheduler = createWorkerScheduler(cycle, {
    retryMaxMs: 1500,
    onUnavailable: unavailable,
  });
  scheduler.wake();
  await vi.advanceTimersByTimeAsync(999);
  expect(cycle).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(1);
  expect(cycle).toHaveBeenCalledTimes(2);
  await vi.advanceTimersByTimeAsync(1500);
  expect(cycle).toHaveBeenCalledTimes(3);
  await vi.advanceTimersByTimeAsync(1000);
  expect(cycle).toHaveBeenCalledTimes(4);
  await vi.advanceTimersByTimeAsync(1000);
  expect(cycle).toHaveBeenCalledTimes(5);
  expect(unavailable.mock.calls).toEqual([[], [], []]);
  await scheduler.close();
  scheduler.wake();
  await vi.advanceTimersByTimeAsync(60000);
  expect(cycle).toHaveBeenCalledTimes(5);
  expect(vi.getTimerCount()).toBe(0);
});

it("waits for active work on shutdown and never reads during long timer chunks", async () => {
  vi.useFakeTimers();
  let finish: ((value: number | null) => void) | undefined;
  const cycle = vi
    .fn<() => Promise<number | null>>()
    .mockResolvedValueOnce(2147483647 + 5000)
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
  const scheduler = createWorkerScheduler(cycle, { retryMaxMs: 30000 });
  scheduler.wake();
  await vi.advanceTimersByTimeAsync(2147483647);
  expect(cycle).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(5000);
  expect(cycle).toHaveBeenCalledTimes(2);
  let closed = false;
  const closing = scheduler.close().then(() => {
    closed = true;
  });
  await Promise.resolve();
  expect(closed).toBe(false);
  finish?.(0);
  await closing;
  expect(vi.getTimerCount()).toBe(0);
});
