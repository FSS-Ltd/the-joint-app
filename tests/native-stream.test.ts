import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { readNativeStatusStream } from "./fixtures/native-events.js";
import {
  nativeWire,
  selector,
  flush,
  deferred,
} from "./fixtures/native-stream.js";
import { createNativeTransport } from "./fixtures/native-api.js";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

it("delivers fragmented empty controls before EOF and stops callbacks after abort", async () => {
  const wire = nativeWire(),
    abort = new AbortController();
  const signals: string[] = [];
  const ended = readNativeStatusStream(
    selector,
    wire.transport,
    abort.signal,
    (value) => {
      signals.push(value);
      if (value === "renew") abort.abort();
    },
  );
  const rejected = expect(ended).rejects.toMatchObject({ status: 0 });
  await flush();
  wire.emit("event: ch");
  wire.emit("ange\r\ndata: {}\r\n\r\n: keepalive\n\n");
  await flush();
  expect(signals).toEqual(["change"]);
  wire.emit("event: renew\ndata: {}\n\nevent: change\ndata: {}\n\n");
  await rejected;
  expect(signals).toEqual(["change", "renew"]);
  expect(wire.connections[0]?.signal.aborted).toBe(true);
  expect(wire.connections[0]?.cancel).toHaveBeenCalledOnce();
  expect(vi.getTimerCount()).toBe(0);
  expect(wire.send.mock.calls[0]?.[1]).toMatchObject({
    credentials: "omit",
    redirect: "error",
  });
});

it.each([
  'event: change\ndata: {"secret":"private"}\n\n',
  "event: unknown\ndata: {}\n\n",
  ": untrusted\n\n",
  "event: change\ndata: []\n\n",
])("rejects invalid frames without leaking payloads: %s", async (text) => {
  const wire = nativeWire(),
    receive = vi.fn();
  const done = readNativeStatusStream(
    selector,
    wire.transport,
    new AbortController().signal,
    receive,
  );
  const rejected = expect(done).rejects.toMatchObject({
    code: "INVALID_STATUS_STREAM",
  });
  await flush();
  wire.emit(text);
  await rejected;
  expect(receive).not.toHaveBeenCalled();
  expect(wire.connections[0]?.signal.aborted).toBe(true);
  expect(vi.getTimerCount()).toBe(0);
});

it.each([301, 401, 403, 404, 503])(
  "closes HTTP %i without reading error bodies",
  async (status) => {
    const cancel = vi.fn();
    const transport = createNativeTransport(
      "https://synthetic.example.test",
      async () => "token",
      async () => new Response(new ReadableStream({ cancel }), { status }),
    );
    await expect(
      readNativeStatusStream(
        selector,
        transport,
        new AbortController().signal,
        vi.fn(),
      ),
    ).rejects.toMatchObject({ status });
    expect(cancel).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  },
);

it("rejects wrong MIME and absent body", async () => {
  for (const response of [
    new Response("private", {
      headers: { "Content-Type": "application/json" },
    }),
    new Response(null, { headers: { "Content-Type": "text/event-stream" } }),
  ]) {
    const transport = createNativeTransport(
      "https://synthetic.example.test",
      async () => "token",
      async () => response,
    );
    await expect(
      readNativeStatusStream(
        selector,
        transport,
        new AbortController().signal,
        vi.fn(),
      ),
    ).rejects.toMatchObject({ code: "INVALID_STATUS_STREAM" });
  }
  expect(vi.getTimerCount()).toBe(0);
});

it("bounds token acquisition and ignores a late token after abort", async () => {
  const token = deferred<string>(),
    wire = nativeWire(() => token.promise);
  const done = readNativeStatusStream(
    selector,
    wire.transport,
    new AbortController().signal,
    vi.fn(),
  );
  const rejected = expect(done).rejects.toMatchObject({ status: 0 });
  await vi.advanceTimersByTimeAsync(15000);
  await rejected;
  token.resolve("late-token");
  await flush();
  expect(wire.send).not.toHaveBeenCalled();
  expect(vi.getTimerCount()).toBe(0);
});

it("validated keepalives extend silence only; partial bytes cannot keep a stream alive", async () => {
  const wire = nativeWire(),
    receive = vi.fn();
  const done = readNativeStatusStream(
    selector,
    wire.transport,
    new AbortController().signal,
    receive,
  );
  const rejected = expect(done).rejects.toMatchObject({ status: 0 });
  await flush();
  for (let count = 0; count < 8; count++) {
    await vi.advanceTimersByTimeAsync(15000);
    wire.emit(": keepalive\n\n");
    await flush();
  }
  expect(wire.send).toHaveBeenCalledOnce();
  expect(receive).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(44000);
  wire.emit("event: ch");
  await flush();
  await vi.advanceTimersByTimeAsync(1000);
  await rejected;
  expect(wire.connections[0]?.signal.aborted).toBe(true);
  expect(vi.getTimerCount()).toBe(0);
});

it.each(["", "event: change\ndata: {"])(
  "rejects EOF and releases the reader: %s",
  async (tail) => {
    const releaseLock = vi.fn(),
      cancel = vi.fn(async () => {});
    const chunks = [new TextEncoder().encode(tail)];
    const transport = createNativeTransport(
      "https://synthetic.example.test",
      async () => "token",
      async () => ({
        status: 200,
        headers: new Headers({ "Content-Type": "text/event-stream" }),
        body: {
          cancel,
          getReader: () => ({
            cancel,
            releaseLock,
            read: async () => {
              const value = chunks.shift();
              return value ? { done: false, value } : { done: true };
            },
          }),
        },
      }),
    );
    await expect(
      readNativeStatusStream(
        selector,
        transport,
        new AbortController().signal,
        vi.fn(),
      ),
    ).rejects.toMatchObject(
      tail ? { code: "INVALID_STATUS_STREAM" } : { status: 0 },
    );
    expect(cancel).toHaveBeenCalledOnce();
    expect(releaseLock).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  },
);

it("fences late chunks from a reader that ignores cancellation and releases its lock", async () => {
  const chunk = deferred<{ done: boolean; value?: Uint8Array }>();
  const cancel = vi.fn(async () => {}),
    releaseLock = vi.fn(),
    receive = vi.fn();
  const transport = createNativeTransport(
    "https://synthetic.example.test",
    async () => "token",
    async () => ({
      status: 200,
      headers: new Headers({ "Content-Type": "text/event-stream" }),
      body: {
        cancel,
        getReader: () => ({ cancel, releaseLock, read: () => chunk.promise }),
      },
    }),
  );
  const abort = new AbortController();
  const ended = expect(
    readNativeStatusStream(selector, transport, abort.signal, receive),
  ).rejects.toMatchObject({ status: 0 });
  await flush();
  abort.abort();
  await ended;
  chunk.resolve({
    done: false,
    value: new TextEncoder().encode("event: change\ndata: {}\n\n"),
  });
  await flush();
  expect(receive).not.toHaveBeenCalled();
  expect(cancel).toHaveBeenCalledOnce();
  expect(releaseLock).toHaveBeenCalledOnce();
  expect(vi.getTimerCount()).toBe(0);
});

it("does not acquire credentials for unsupported selectors or a pre-aborted caller", async () => {
  const token = vi.fn(async () => "token"),
    wire = nativeWire(token),
    abort = new AbortController();
  await expect(
    readNativeStatusStream(
      { kind: "deletion", id: selector.householdId },
      wire.transport,
      abort.signal,
      vi.fn(),
    ),
  ).rejects.toMatchObject({ status: 400 });
  abort.abort();
  await expect(
    readNativeStatusStream(selector, wire.transport, abort.signal, vi.fn()),
  ).rejects.toMatchObject({ status: 0 });
  expect(token).not.toHaveBeenCalled();
  expect(vi.getTimerCount()).toBe(0);
});

it("admits canonical wealth streams without changing keepalive or abort cleanup", async () => {
  const wire = nativeWire(),
    abort = new AbortController(),
    receive = vi.fn();
  const done = readNativeStatusStream(
    {
      kind: "wealth",
      householdId: selector.householdId,
      accountIds: selector.householdId,
    },
    wire.transport,
    abort.signal,
    receive,
  );
  const rejected = expect(done).rejects.toMatchObject({ status: 0 });
  await flush();
  wire.emit("event: change\ndata: {}\n\n");
  await flush();
  expect(receive).toHaveBeenCalledWith("change");
  wire.emit(": keepalive\n\n");
  await flush();
  expect(receive).toHaveBeenCalledOnce();
  abort.abort();
  await rejected;
  expect(wire.connections[0]?.cancel).toHaveBeenCalledOnce();
  expect(vi.getTimerCount()).toBe(0);
});

it("opens a status stream for an import batch and refuses an export selector", async () => {
  const batch = "11111111-1111-4111-8111-111111111111";
  const wire = nativeWire(),
    abort = new AbortController();
  const open = readNativeStatusStream(
    { kind: "import", householdId: selector.householdId, id: batch },
    wire.transport,
    abort.signal,
    () => {},
  );
  const closed = expect(open).rejects.toMatchObject({ status: 0 });
  await flush();
  expect(String(wire.send.mock.calls[0]?.[0])).toContain("kind=import");
  abort.abort();
  await closed;
  await expect(
    readNativeStatusStream(
      { kind: "export", householdId: selector.householdId, id: batch },
      wire.transport,
      new AbortController().signal,
      () => {},
    ),
  ).rejects.toMatchObject({ code: "INVALID_STATUS_SELECTOR" });
});
