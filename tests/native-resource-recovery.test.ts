import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { resourceFixture as setup } from "./fixtures/native-resource.js";
import { flush } from "./fixtures/native-stream.js";
beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());
const changed = "event: change\ndata: {}\n\n";
it("uses five bounded reconnect waits, catches up once and clears scheduled retries on close", async () => {
  const test = setup();
  test.controller.start();
  await flush();
  for (const [index, delay] of [1000, 2000, 4000, 8000, 16000].entries()) {
    test.emit("event: reconnect\ndata: {}\n\n");
    await flush();
    await vi.advanceTimersByTimeAsync(delay - 1);
    expect(test.send).toHaveBeenCalledTimes(index + 1);
    await vi.advanceTimersByTimeAsync(1);
    expect(test.send).toHaveBeenCalledTimes(index + 2);
  }
  test.emit(changed);
  await flush();
  expect(test.read).toHaveBeenCalledOnce();
  test.emit("event: reconnect\ndata: {}\n\n");
  await flush();
  expect(test.failure).toHaveBeenCalledOnce();
  expect(vi.getTimerCount()).toBe(0);
  test.controller.retry();
  await flush();
  test.emit("event: renew\ndata: {}\n\n");
  await flush();
  test.controller.close();
  expect(vi.getTimerCount()).toBe(0);
  await vi.advanceTimersByTimeAsync(300000);
  expect(test.send).toHaveBeenCalledTimes(7);
});

it("resets retry budget after 30000ms live without adding a network discovery timer", async () => {
  const test = setup();
  test.controller.start();
  await flush();
  test.emit("event: reconnect\ndata: {}\n\n");
  await flush();
  await vi.advanceTimersByTimeAsync(1000);
  test.emit(changed);
  await flush();
  await vi.advanceTimersByTimeAsync(30000);
  expect(test.send).toHaveBeenCalledTimes(2);
  expect(test.read).toHaveBeenCalledOnce();
  test.emit("event: reconnect\ndata: {}\n\n");
  await flush();
  await vi.advanceTimersByTimeAsync(1000);
  expect(test.send).toHaveBeenCalledTimes(3);
  test.controller.close();
});

it("never automatically retries invalid protocol and clears retry timers on background", async () => {
  const test = setup();
  test.controller.start();
  await flush();
  test.emit("data: private\n\n");
  await flush();
  expect(test.failure).toHaveBeenCalledWith(
    expect.objectContaining({ code: "INVALID_STATUS_STREAM" }),
  );
  await vi.advanceTimersByTimeAsync(100000);
  expect(test.send).toHaveBeenCalledOnce();
  test.controller.retry();
  await flush();
  test.emit("event: reconnect\ndata: {}\n\n");
  await flush();
  test.controller.background();
  expect(vi.getTimerCount()).toBe(0);
  await vi.advanceTimersByTimeAsync(100000);
  expect(test.send).toHaveBeenCalledTimes(2);
  test.controller.close();
});

it.each([408, 429, 503])(
  "retries HTTP %i with no read before the replacement stream's initial event",
  async (status) => {
    const test = setup();
    test.send.mockResolvedValueOnce(new Response(null, { status }));
    test.controller.start();
    await flush();
    expect(test.read).not.toHaveBeenCalled();
    expect(test.failure).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1000);
    test.emit(changed);
    await flush();
    expect(test.read).toHaveBeenCalledOnce();
    test.controller.close();
  },
);

it("does not let reentrant concealment schedule background work or publish obsolete data", async () => {
  const test = setup();
  test.controller.start();
  await flush();
  test.emit(changed);
  await flush();
  test.unavailable.mockImplementation(() => test.controller.background());
  test.emit("event: reconnect\ndata: {}\n\n");
  await flush();
  expect(vi.getTimerCount()).toBe(0);
  await vi.advanceTimersByTimeAsync(100000);
  expect(test.send).toHaveBeenCalledOnce();
  test.controller.close();
});
