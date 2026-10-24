import { afterEach, expect, it, vi } from "vitest";
import { createWorkerNotifications } from "../packages/database/src/worker-notifications.js";

const fixture = vi.hoisted(() => ({ ended: vi.fn() }));
vi.mock("../packages/database/node_modules/pg/esm/index.mjs", () => ({
  default: {
    Client: class {
      on(): this {
        return this;
      }
      connect(): Promise<void> {
        return new Promise(() => {});
      }
      async query(): Promise<void> {}
      async end(): Promise<void> {
        fixture.ended();
      }
    },
  },
}));
afterEach(() => vi.useRealTimers());

it("closes during unfinished authentication even when pg never settles connect", async () => {
  vi.useFakeTimers();
  const ready = vi.fn();
  const subscription = createWorkerNotifications({
    connectionString: "postgresql://synthetic.invalid/test",
    timeoutMs: 100,
    retryMaxMs: 1000,
    onReady: ready,
    onWake: vi.fn(),
  });
  let closed = false;
  const closing = subscription.close().then(() => {
    closed = true;
  });
  await vi.advanceTimersByTimeAsync(2000);
  expect(closed).toBe(true);
  expect(ready).not.toHaveBeenCalled();
  expect(fixture.ended).toHaveBeenCalled();
  expect(vi.getTimerCount()).toBe(0);
  await closing;
});
