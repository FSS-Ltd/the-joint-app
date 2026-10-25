import { expect, it, vi } from "vitest";
import {
  StatusEventHub,
  type StatusHubCallbacks,
} from "../apps/api/src/modules/events/status-hub.js";

it("shares one listener, rejects disconnected subscriptions and releases every subscriber on loss/shutdown", async () => {
  let callbacks: StatusHubCallbacks | undefined;
  const close = vi.fn(async () => {});
  const start = vi.fn((value: StatusHubCallbacks) => {
    callbacks = value;
    return { close };
  });
  const hub = new StatusEventHub(start);
  expect(() => hub.subscribe(vi.fn(), vi.fn())).toThrow();
  callbacks?.onReady();
  const first = vi.fn(),
    second = vi.fn(),
    disconnected = vi.fn();
  const stop = hub.subscribe(first, disconnected);
  hub.subscribe(second, disconnected);
  callbacks?.onWake();
  expect(first).toHaveBeenCalledTimes(1);
  expect(second).toHaveBeenCalledTimes(1);
  stop();
  callbacks?.onWake();
  expect(first).toHaveBeenCalledTimes(1);
  expect(second).toHaveBeenCalledTimes(2);
  callbacks?.onUnavailable();
  expect(disconnected).toHaveBeenCalledTimes(1);
  callbacks?.onReady();
  callbacks?.onWake();
  expect(second).toHaveBeenCalledTimes(2);
  hub.subscribe(first, disconnected);
  await hub.onModuleDestroy();
  await hub.close();
  expect(close).toHaveBeenCalledTimes(1);
  expect(disconnected).toHaveBeenCalledTimes(2);
  callbacks?.onReady();
  expect(() => hub.subscribe(first, disconnected)).toThrow();
  expect(start).toHaveBeenCalledTimes(1);
});

it("bounds active stream memory and restores capacity after unsubscribe", async () => {
  let callbacks: StatusHubCallbacks | undefined;
  const hub = new StatusEventHub((value) => {
    callbacks = value;
    return { close: async () => {} };
  });
  callbacks?.onReady();
  const stops = Array.from({ length: 256 }, () =>
    hub.subscribe(vi.fn(), vi.fn()),
  );
  expect(() => hub.subscribe(vi.fn(), vi.fn())).toThrow();
  stops[0]?.();
  expect(() => hub.subscribe(vi.fn(), vi.fn())).not.toThrow();
  await hub.close();
});
