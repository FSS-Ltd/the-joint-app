import { afterEach, expect, it, vi } from "vitest";
import {
  authorizeStatusObserver,
  type StatusSnapshot,
} from "../apps/api/src/modules/events/status-observer.js";

afterEach(() => vi.useRealTimers());
function fixture() {
  const listeners = new Set<{ wake: () => void; disconnect: () => void }>();
  const source = {
    subscribe(wake: () => void, disconnect: () => void) {
      const listener = { wake, disconnect };
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
  const wake = () => {
    for (const listener of [...listeners]) listener.wake();
  };
  const snapshot = (
    fingerprint = "unchanged",
    expires = Date.now() + 86400000,
  ): StatusSnapshot => ({
    fingerprint,
    credentialExpiresAt: expires,
    resourceExpiresAt: null,
    expiryEvent: "renew",
  });
  return { source, listeners, wake, snapshot };
}

it("subscribes before the first read, catches initial races, and makes no idle reads", async () => {
  vi.useFakeTimers();
  const f = fixture();
  const send = vi.fn(() => true),
    close = vi.fn();
  const read = vi.fn(async () => {
    expect(f.listeners.size).toBe(1);
    if (read.mock.calls.length === 1) f.wake();
    return f.snapshot();
  });
  const observer = await authorizeStatusObserver({
    source: f.source,
    read,
    send,
    close,
  });
  expect(send).not.toHaveBeenCalled();
  observer.start();
  await vi.advanceTimersByTimeAsync(0);
  expect(read).toHaveBeenCalledTimes(2);
  expect(send.mock.calls).toEqual([["change"]]);
  await vi.advanceTimersByTimeAsync(600000);
  expect(read).toHaveBeenCalledTimes(2);
  observer.close();
  expect(f.listeners.size).toBe(0);
  expect(vi.getTimerCount()).toBe(0);
});

it("coalesces concurrent hints, suppresses duplicates and invalidates revoked authority", async () => {
  vi.useFakeTimers();
  const f = fixture();
  let finish: ((snapshot: StatusSnapshot) => void) | undefined;
  const read = vi
    .fn<() => Promise<StatusSnapshot>>()
    .mockResolvedValueOnce(f.snapshot())
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    )
    .mockResolvedValueOnce(f.snapshot("changed"))
    .mockRejectedValueOnce(
      Object.assign(new Error("private details"), { status: 403 }),
    );
  const send = vi.fn(() => true),
    close = vi.fn();
  const observer = await authorizeStatusObserver({
    source: f.source,
    read,
    send,
    close,
    denied: (error) =>
      typeof error === "object" &&
      error !== null &&
      "status" in error &&
      error.status === 403,
  });
  observer.start();
  f.wake();
  for (let i = 0; i < 100; i++) f.wake();
  finish?.(f.snapshot("changed"));
  await vi.advanceTimersByTimeAsync(0);
  expect(read).toHaveBeenCalledTimes(3);
  expect(send.mock.calls).toEqual([["change"], ["change"]]);
  f.wake();
  await vi.advanceTimersByTimeAsync(0);
  expect(send.mock.calls.at(-1)).toEqual(["invalidate"]);
  expect(close).toHaveBeenCalledTimes(1);
  expect(f.listeners.size).toBe(0);
  observer.close();
  expect(close).toHaveBeenCalledTimes(1);
});

it("checks resource expiry once, then renews at credential expiry without recurring scans", async () => {
  vi.useFakeTimers();
  const f = fixture(),
    now = Date.now();
  const read = vi
    .fn<() => Promise<StatusSnapshot>>()
    .mockResolvedValueOnce({
      ...f.snapshot("ready", now + 2000),
      resourceExpiresAt: now + 1000,
    })
    .mockResolvedValue({
      ...f.snapshot("expired", now + 2000),
      resourceExpiresAt: now + 1000,
    });
  const send = vi.fn(() => true),
    close = vi.fn();
  const observer = await authorizeStatusObserver({
    source: f.source,
    read,
    send,
    close,
  });
  observer.start();
  await vi.advanceTimersByTimeAsync(1000);
  expect(read).toHaveBeenCalledTimes(2);
  expect(send.mock.calls).toEqual([["change"], ["change"]]);
  await vi.advanceTimersByTimeAsync(1000);
  expect(read).toHaveBeenCalledTimes(2);
  expect(send.mock.calls.at(-1)).toEqual(["renew"]);
  expect(close).toHaveBeenCalledTimes(1);
  expect(vi.getTimerCount()).toBe(0);
});

it("drops output and unsubscribes on backpressure or transport loss", async () => {
  const f = fixture(),
    close = vi.fn(),
    send = vi.fn(() => false);
  const observer = await authorizeStatusObserver({
    source: f.source,
    read: async () => f.snapshot(),
    send,
    close,
  });
  observer.start();
  expect(f.listeners.size).toBe(0);
  expect(close).toHaveBeenCalledTimes(1);
  f.wake();
  expect(send).toHaveBeenCalledTimes(1);
  const lost = vi.fn(() => true);
  const second = await authorizeStatusObserver({
    source: f.source,
    read: async () => f.snapshot(),
    send: lost,
    close,
  });
  second.start();
  for (const listener of [...f.listeners]) listener.disconnect();
  expect(lost.mock.calls).toEqual([["change"], ["reconnect"]]);
  expect(f.listeners.size).toBe(0);
});

it("unsubscribes if cancelled during authorization and never emits late data", async () => {
  const f = fixture(),
    abort = new AbortController(),
    send = vi.fn(() => true),
    close = vi.fn();
  let finish: ((snapshot: StatusSnapshot) => void) | undefined;
  const opening = authorizeStatusObserver({
    source: f.source,
    signal: abort.signal,
    read: () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
    send,
    close,
  });
  const rejected = expect(opening).rejects.toMatchObject({
    name: "AbortError",
  });
  abort.abort();
  expect(f.listeners.size).toBe(0);
  finish?.(f.snapshot());
  await rejected;
  expect(send).not.toHaveBeenCalled();
  expect(close).toHaveBeenCalledTimes(1);
});

it("keeps credential expiry armed while resource reconciliation is unresolved", async () => {
  vi.useFakeTimers();
  const f = fixture(),
    now = Date.now();
  let finish: ((snapshot: StatusSnapshot) => void) | undefined;
  const read = vi
    .fn<() => Promise<StatusSnapshot>>()
    .mockResolvedValueOnce({
      ...f.snapshot("ready", now + 100),
      resourceExpiresAt: now + 20,
    })
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
  const send = vi.fn(() => true),
    close = vi.fn();
  const observer = await authorizeStatusObserver({
    source: f.source,
    read,
    send,
    close,
  });
  observer.start();
  await vi.advanceTimersByTimeAsync(160);
  expect(read).toHaveBeenCalledTimes(2);
  expect(close).toHaveBeenCalledTimes(1);
  expect(f.listeners.size).toBe(0);
  expect(send.mock.calls).toEqual([["change"], ["renew"]]);
  finish?.(f.snapshot("late", now + 1000));
  await vi.advanceTimersByTimeAsync(0);
  expect(send.mock.calls).toHaveLength(2);
  expect(vi.getTimerCount()).toBe(0);
});

it("catches deadlines crossed during authorization once without looping on an elapsed deadline", async () => {
  vi.useFakeTimers();
  const f = fixture(),
    now = Date.now();
  let finish: ((snapshot: StatusSnapshot) => void) | undefined;
  const read = vi
    .fn<() => Promise<StatusSnapshot>>()
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    )
    .mockResolvedValue({
      ...f.snapshot("expired", now + 2000),
      resourceExpiresAt: now + 20,
    });
  const send = vi.fn(() => true),
    close = vi.fn();
  const opening = authorizeStatusObserver({
    source: f.source,
    read,
    send,
    close,
  });
  await vi.advanceTimersByTimeAsync(50);
  finish?.({ ...f.snapshot("stale", now + 2000), resourceExpiresAt: now + 20 });
  const observer = await opening;
  observer.start();
  await vi.advanceTimersByTimeAsync(100);
  expect(read).toHaveBeenCalledTimes(2);
  expect(send.mock.calls).toEqual([["change"], ["change"]]);
  observer.close();
  expect(vi.getTimerCount()).toBe(0);
});
