import { expect, it, vi } from "vitest";
import { createDatabaseNotifications } from "../packages/database/src/notifications.js";

const fixture = vi.hoisted(() => ({
  callbacks: new Map<string, (...args: unknown[]) => void>(),
  query: vi.fn(async () => {}),
}));
vi.mock("../packages/database/node_modules/pg/esm/index.mjs", () => ({
  default: {
    Client: class {
      on(name: string, callback: (...args: unknown[]) => void): this {
        fixture.callbacks.set(name, callback);
        return this;
      }
      async connect(): Promise<void> {}
      query = fixture.query;
      async end(): Promise<void> {
        fixture.callbacks.get("end")?.();
      }
    },
  },
}));

it("uses a fixed status topic, accepts only empty matching hints and ignores delivery after close", async () => {
  const ready = vi.fn(),
    wake = vi.fn();
  const subscription = createDatabaseNotifications({
    topic: "status",
    connectionString: "postgresql://synthetic.invalid/test",
    timeoutMs: 100,
    retryMaxMs: 1000,
    onReady: ready,
    onWake: wake,
  });
  await vi.waitFor(() => expect(ready).toHaveBeenCalledTimes(1));
  expect(fixture.query).toHaveBeenCalledWith("LISTEN joint_status_wakeup");
  const notification = fixture.callbacks.get("notification");
  notification?.({ channel: "joint_worker_wakeup", payload: "" });
  notification?.({
    channel: "joint_status_wakeup",
    payload: "private-untrusted",
  });
  expect(wake).not.toHaveBeenCalled();
  notification?.({ channel: "joint_status_wakeup", payload: "" });
  expect(wake.mock.calls).toEqual([[]]);
  await subscription.close();
  notification?.({ channel: "joint_status_wakeup", payload: "" });
  expect(wake).toHaveBeenCalledTimes(1);
});
