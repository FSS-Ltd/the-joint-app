import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { readStatusStream } from "../apps/web/components/events/status-stream.js";

let wire: ReadableStreamDefaultController<Uint8Array>;
let networkSignal: AbortSignal | undefined;
let fetched: ReturnType<typeof vi.fn<typeof fetch>>;
beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("window", { location: new URL("http://joint.test/") });
  fetched = vi.fn<typeof fetch>(async (_url, init) => {
    if (!(init?.signal instanceof AbortSignal))
      throw Error("Missing cancellation");
    networkSignal = init.signal;
    return new Response(
      new ReadableStream<Uint8Array>({
        start(controller) {
          wire = controller;
          networkSignal?.addEventListener(
            "abort",
            () => {
              try {
                controller.error(new DOMException("Aborted", "AbortError"));
              } catch {
                /* Already settled. */
              }
            },
            { once: true },
          );
        },
      }),
      { headers: { "Content-Type": "text/event-stream; charset=utf-8" } },
    );
  });
  vi.stubGlobal("fetch", fetched);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
const emit = (value: string) => wire.enqueue(new TextEncoder().encode(value));

it("accepts fragmented empty controls, ignores heartbeats and cancels the owned request", async () => {
  const abort = new AbortController(),
    signal = vi.fn();
  const stream = readStatusStream(
    "/api/events?kind=import",
    abort.signal,
    signal,
  );
  const ended = expect(stream).rejects.toMatchObject({ name: "AbortError" });
  await vi.advanceTimersByTimeAsync(0);
  emit("event: ch");
  emit("ange\r\ndata: {}\r\n\r\n: keepalive\n\nevent: renew\ndata: {}\n\n");
  await vi.advanceTimersByTimeAsync(0);
  expect(signal.mock.calls).toEqual([["change"], ["renew"]]);
  expect(fetched).toHaveBeenCalledWith(
    "/api/events?kind=import",
    expect.objectContaining({
      credentials: "same-origin",
      cache: "no-store",
      redirect: "error",
      headers: { Accept: "text/event-stream" },
    }),
  );
  abort.abort();
  await ended;
  expect(networkSignal?.aborted).toBe(true);
  expect(vi.getTimerCount()).toBe(0);
});

it("rejects private payloads, invalid content and cross-origin paths safely", async () => {
  const signal = vi.fn(),
    abort = new AbortController();
  const stream = readStatusStream("/api/events", abort.signal, signal);
  const rejected = expect(stream).rejects.toMatchObject({
    status: 502,
    code: "INVALID_STATUS_STREAM",
  });
  await vi.advanceTimersByTimeAsync(0);
  emit('event: change\ndata: {"secret":"do-not-display"}\n\n');
  await rejected;
  expect(signal).not.toHaveBeenCalled();
  expect(vi.getTimerCount()).toBe(0);
  fetched.mockResolvedValueOnce(
    new Response("private upstream details", {
      headers: { "Content-Type": "application/json" },
    }),
  );
  await expect(
    readStatusStream("/api/events", abort.signal, signal),
  ).rejects.toMatchObject({ code: "INVALID_STATUS_STREAM" });
  await expect(
    readStatusStream("https://other.test/api/events", abort.signal, signal),
  ).rejects.toMatchObject({ status: 400 });
});

it("exposes HTTP authority status without reading private error bodies", async () => {
  const response = new Response("private details", { status: 403 });
  const text = vi.spyOn(response, "text"),
    json = vi.spyOn(response, "json");
  fetched.mockResolvedValueOnce(response);
  await expect(
    readStatusStream("/api/events", new AbortController().signal, vi.fn()),
  ).rejects.toMatchObject({ status: 403 });
  expect(text).not.toHaveBeenCalled();
  expect(json).not.toHaveBeenCalled();
  expect(vi.getTimerCount()).toBe(0);
});

it("bounds handshakes and inactive transports without status polling", async () => {
  fetched.mockImplementationOnce(
    (_url, init) =>
      new Promise((_resolve, reject) =>
        init?.signal?.addEventListener(
          "abort",
          () => reject(new DOMException("Aborted", "AbortError")),
          { once: true },
        ),
      ),
  );
  const handshake = readStatusStream(
    "/api/events",
    new AbortController().signal,
    vi.fn(),
  );
  const rejected = expect(handshake).rejects.toMatchObject({ status: 0 });
  await vi.advanceTimersByTimeAsync(10000);
  await rejected;
  expect(vi.getTimerCount()).toBe(0);
  const signal = vi.fn();
  const active = readStatusStream(
    "/api/events",
    new AbortController().signal,
    signal,
  );
  const expired = expect(active).rejects.toMatchObject({ status: 0 });
  await vi.advanceTimersByTimeAsync(0);
  for (let n = 0; n < 8; n++) {
    await vi.advanceTimersByTimeAsync(15000);
    emit(": keepalive\n\n");
    await vi.advanceTimersByTimeAsync(0);
  }
  expect(signal).not.toHaveBeenCalled();
  expect(fetched).toHaveBeenCalledTimes(2);
  await vi.advanceTimersByTimeAsync(45000);
  await expired;
  expect(networkSignal?.aborted).toBe(true);
  expect(vi.getTimerCount()).toBe(0);
});
