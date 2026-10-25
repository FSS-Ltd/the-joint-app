import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { StatusSignal } from "../packages/contracts/src/events.js";
import { RequestError } from "../apps/web/components/identity/client.js";
import { watchStatusResource } from "../apps/web/components/events/status-subscription.js";
import { statusPath } from "../apps/web/components/events/status-path.js";

const transport = vi.hoisted(() => ({ read: vi.fn() }));
vi.mock("../apps/web/components/events/status-stream.js", () => ({
  readStatusStream: transport.read,
}));
const selector = {
  kind: "import" as const,
  id: "22222222-2222-4222-8222-222222222222",
  householdId: "11111111-1111-4111-8111-111111111111",
};
interface Connection {
  signal: AbortSignal;
  emit: (signal: StatusSignal) => void;
  reject: (error: unknown) => void;
}
let connections: Connection[];
let browser: EventTarget;
beforeEach(() => {
  vi.useFakeTimers();
  connections = [];
  browser = new EventTarget();
  vi.stubGlobal("window", browser);
  vi.stubGlobal("navigator", { onLine: true });
  transport.read.mockReset().mockImplementation(
    (_path: string, signal: AbortSignal, emit: Connection["emit"]) =>
      new Promise<void>((_resolve, reject) => {
        connections.push({ signal, emit, reject });
        signal.addEventListener(
          "abort",
          () => reject(new DOMException("Closed", "AbortError")),
          { once: true },
        );
      }),
  );
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
function fixture(
  read = vi.fn<(signal: AbortSignal) => Promise<string>>(async () => "current"),
) {
  const receive = vi.fn(),
    unavailable = vi.fn(),
    failure = vi.fn();
  const stop = watchStatusResource({
    selector,
    read,
    receive,
    unavailable,
    failure,
  });
  return { read, receive, unavailable, failure, stop };
}
function connection(): Connection {
  const value = connections.at(-1);
  if (!value) throw Error("Missing synthetic connection");
  return value;
}

it("builds typed paths without credentials and isolates deletion receipt cookies", () => {
  const url = new URL(statusPath(selector), "http://joint.test");
  expect(url.pathname).toBe("/api/events");
  expect(Object.fromEntries(url.searchParams)).toEqual(selector);
  expect(statusPath({ kind: "deletion", id: selector.id })).toBe(
    `/api/privacy/deletion-requests/${selector.id}/events`,
  );
  expect(statusPath({ kind: "archive-export", id: selector.id })).toContain(
    "kind=archive-export",
  );
});

it("reads only after signals, coalesces bursts and performs zero idle reads", async () => {
  let finish: ((value: string) => void) | undefined;
  const read = vi
    .fn<(signal: AbortSignal) => Promise<string>>()
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    )
    .mockResolvedValue("current");
  const f = fixture(read);
  expect(read).not.toHaveBeenCalled();
  connection().emit("change");
  for (let n = 0; n < 100; n++) connection().emit("change");
  expect(read).toHaveBeenCalledTimes(1);
  finish?.("current");
  await vi.advanceTimersByTimeAsync(0);
  expect(read).toHaveBeenCalledTimes(2);
  await vi.advanceTimersByTimeAsync(600000);
  expect(read).toHaveBeenCalledTimes(2);
  expect(transport.read).toHaveBeenCalledTimes(1);
  f.stop();
  expect(vi.getTimerCount()).toBe(0);
});

it("aborts late reads and releases listeners when authority is invalidated", async () => {
  let finish: ((value: string) => void) | undefined;
  const read = vi.fn<(signal: AbortSignal) => Promise<string>>(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const removed = vi.spyOn(browser, "removeEventListener");
  const f = fixture(read),
    first = connection();
  first.emit("change");
  const signal = read.mock.calls[0]?.[0];
  first.emit("invalidate");
  expect(signal?.aborted).toBe(true);
  expect(first.signal.aborted).toBe(true);
  expect(f.unavailable).toHaveBeenCalled();
  expect(f.failure).toHaveBeenCalledTimes(1);
  finish?.("private old value");
  await vi.advanceTimersByTimeAsync(60000);
  expect(f.receive).not.toHaveBeenCalled();
  expect(transport.read).toHaveBeenCalledTimes(1);
  expect(removed).toHaveBeenCalledTimes(4);
  f.stop();
  expect(vi.getTimerCount()).toBe(0);
});

it("clears disconnected data, catches up on reconnect and stops after bounded failures", async () => {
  const f = fixture();
  connection().emit("change");
  await vi.advanceTimersByTimeAsync(0);
  expect(f.receive).toHaveBeenCalledWith("current");
  connection().reject(new RequestError("Unavailable", 503));
  await vi.advanceTimersByTimeAsync(0);
  expect(f.unavailable).toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(1000);
  expect(transport.read).toHaveBeenCalledTimes(2);
  expect(f.read).toHaveBeenCalledTimes(1);
  connection().emit("change");
  await vi.advanceTimersByTimeAsync(0);
  expect(f.read).toHaveBeenCalledTimes(2);
  for (const delay of [2000, 4000, 8000, 16000]) {
    connection().reject(new RequestError("Unavailable", 0));
    await vi.advanceTimersByTimeAsync(delay);
  }
  connection().reject(new RequestError("Unavailable", 503));
  await vi.advanceTimersByTimeAsync(600000);
  expect(transport.read).toHaveBeenCalledTimes(6);
  expect(f.failure).toHaveBeenCalledTimes(1);
  expect(vi.getTimerCount()).toBe(0);
});

it("does not retry authority or malformed protocol failures", async () => {
  for (const error of [
    new RequestError("Denied", 401),
    new RequestError("Denied", 403),
    new RequestError("Missing", 404),
    new RequestError("Invalid", 502, "INVALID_STATUS_STREAM"),
  ]) {
    const f = fixture(),
      count = transport.read.mock.calls.length;
    connection().reject(error);
    await vi.advanceTimersByTimeAsync(60000);
    expect(transport.read).toHaveBeenCalledTimes(count);
    expect(f.failure).toHaveBeenCalledWith(error);
    f.stop();
  }
});

it("waits offline and reconciles after online or BFCache restoration", async () => {
  const f = fixture();
  const first = connection();
  browser.dispatchEvent(new Event("offline"));
  expect(first.signal.aborted).toBe(true);
  await vi.advanceTimersByTimeAsync(60000);
  expect(transport.read).toHaveBeenCalledTimes(1);
  browser.dispatchEvent(new Event("online"));
  expect(transport.read).toHaveBeenCalledTimes(2);
  browser.dispatchEvent(new Event("online"));
  expect(transport.read).toHaveBeenCalledTimes(2);
  browser.dispatchEvent(new Event("pagehide"));
  const restored = new Event("pageshow");
  Object.defineProperty(restored, "persisted", { value: true });
  browser.dispatchEvent(restored);
  expect(transport.read).toHaveBeenCalledTimes(3);
  connection().emit("change");
  await vi.advanceTimersByTimeAsync(0);
  expect(f.read).toHaveBeenCalledTimes(1);
  f.stop();
  browser.dispatchEvent(new Event("offline"));
  browser.dispatchEvent(new Event("online"));
  browser.dispatchEvent(restored);
  expect(transport.read).toHaveBeenCalledTimes(3);
  expect(vi.getTimerCount()).toBe(0);
});

it("bounds repeated immediate renew controls and renews stable connections without idle reads", async () => {
  const f = fixture();
  for (const delay of [1000, 2000, 4000, 8000, 16000]) {
    connection().emit("change");
    connection().emit("renew");
    await vi.advanceTimersByTimeAsync(delay);
  }
  connection().emit("renew");
  await vi.advanceTimersByTimeAsync(60000);
  expect(transport.read).toHaveBeenCalledTimes(6);
  expect(f.failure).toHaveBeenCalledTimes(1);
  f.stop();
  transport.read.mockClear();
  const second = fixture();
  connection().emit("change");
  await vi.advanceTimersByTimeAsync(60000);
  connection().emit("renew");
  await vi.advanceTimersByTimeAsync(1000);
  expect(transport.read).toHaveBeenCalledTimes(2);
  expect(second.read).toHaveBeenCalledTimes(1);
  second.stop();
});

it("unsubscribes an obsolete resource before a replacement can receive late data", async () => {
  let finish: ((value: string) => void) | undefined;
  const read = vi.fn<(signal: AbortSignal) => Promise<string>>(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const previous = fixture(read),
    first = connection();
  first.emit("change");
  previous.stop();
  expect(first.signal.aborted).toBe(true);
  expect(read.mock.calls[0]?.[0].aborted).toBe(true);
  const replacement = fixture();
  connection().emit("change");
  finish?.("old private value");
  await vi.advanceTimersByTimeAsync(0);
  expect(previous.receive).not.toHaveBeenCalled();
  expect(replacement.receive).toHaveBeenCalledWith("current");
  replacement.stop();
  expect(vi.getTimerCount()).toBe(0);
});
