import { expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
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

it("routes only matching spending hints at full observer capacity", async () => {
  let callbacks: StatusHubCallbacks | undefined;
  const hub = new StatusEventHub((value) => {
    callbacks = value;
    return { close: async () => {} };
  });
  callbacks?.onReady();
  const householdId = "e237d3d7-236f-4ec3-8454-c4e5504d397f";
  const matching = vi.fn(),
    unrelated = vi.fn(),
    legacy = vi.fn();
  hub.forSpending(householdId).subscribe(matching, vi.fn());
  for (let i = 0; i < 254; i++)
    hub
      .forSpending(`00000000-0000-4000-8000-${String(i).padStart(12, "0")}`)
      .subscribe(unrelated, vi.fn());
  hub.subscribe(legacy, vi.fn());
  const scope = createHash("sha256")
    .update(`joint.spending:${householdId}`)
    .digest("hex");
  callbacks?.onSpendingWake(scope);
  expect(matching).toHaveBeenCalledOnce();
  expect(unrelated).not.toHaveBeenCalled();
  expect(legacy).not.toHaveBeenCalled();
  callbacks?.onWake();
  expect(legacy).toHaveBeenCalledOnce();
  expect(matching).toHaveBeenCalledOnce();
  expect(unrelated).not.toHaveBeenCalled();
  callbacks?.onSpendingWake("");
  expect(matching).toHaveBeenCalledTimes(2);
  expect(unrelated).toHaveBeenCalledTimes(254);
  expect(legacy).toHaveBeenCalledOnce();
  await hub.close();
});
