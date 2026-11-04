import { afterEach, expect, it, vi } from "vitest";
import { createNativeTransport } from "./fixtures/native-api.js";
import type { NativeSend } from "../apps/mobile/src/api/types.js";

const base = "https://api.example.test";
const householdId = "00000000-0000-4000-8000-000000000001";
const selector = { kind: "accounts", householdId, limit: 50 } as const;
const signal = () => new AbortController().signal;
afterEach(() => vi.useRealTimers());

it.each(["close", "caller"] as const)(
  "opens only the fixed status endpoint and cancels its reader on %s",
  async (reason) => {
    vi.useFakeTimers();
    const cancel = vi.fn();
    const send = vi.fn<NativeSend>(
      async () =>
        new Response(new ReadableStream({ cancel }), {
          headers: { "Content-Type": "text/event-stream" },
        }),
    );
    const caller = new AbortController();
    const remove = vi.spyOn(caller.signal, "removeEventListener");
    const transport = createNativeTransport(base, async () => "token", send);
    const connection = await transport.openStatus(selector, caller.signal);
    expect(send).toHaveBeenCalledWith(
      `${base}/v1/events?kind=accounts&householdId=${householdId}&limit=50`,
      expect.objectContaining({
        method: "GET",
        headers: { Authorization: "Bearer token", Accept: "text/event-stream" },
        credentials: "omit",
        redirect: "error",
      }),
    );
    expect(vi.getTimerCount()).toBe(0);
    const reader = connection.response.body?.getReader();
    const read = reader?.read().catch((error) => {
      expect(error).toMatchObject({ status: 0 });
    });
    if (reason === "close") connection.close();
    else caller.abort();
    connection.close();
    expect(send.mock.calls[0]?.[1].signal.aborted).toBe(true);
    expect(remove).toHaveBeenCalled();
    expect(cancel).toHaveBeenCalledOnce();
    await read;
    reader?.releaseLock();
  },
);
it("times out status handshakes and cancels late response bodies", async () => {
  vi.useFakeTimers();
  let finish: ((response: Response) => void) | undefined;
  const cancel = vi.fn();
  const transport = createNativeTransport(
    base,
    async () => "token",
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const rejected = expect(
    transport.openStatus(selector, signal()),
  ).rejects.toMatchObject({ status: 0 });
  await vi.advanceTimersByTimeAsync(15000);
  await rejected;
  finish?.(new Response(new ReadableStream({ cancel })));
  await vi.advanceTimersByTimeAsync(0);
  expect(cancel).toHaveBeenCalledOnce();
  expect(vi.getTimerCount()).toBe(0);
});
it("fences late stream chunks after close even when the source ignores cancel", async () => {
  let finish:
    ((value: { done: boolean; value?: Uint8Array }) => void) | undefined;
  const cancel = vi.fn(async () => {});
  const transport = createNativeTransport(
    base,
    async () => "token",
    async () => ({
      status: 200,
      headers: new Headers({ "Content-Type": "text/event-stream" }),
      body: {
        cancel,
        getReader: () => ({
          read: () =>
            new Promise((resolve) => {
              finish = resolve;
            }),
          cancel,
          releaseLock: () => {},
        }),
      },
    }),
  );
  const connection = await transport.openStatus(selector, signal());
  const reader = connection.response.body?.getReader();
  if (!reader) throw Error("Expected stream reader");
  const read = reader.read();
  const rejected = expect(read).rejects.toMatchObject({ status: 0 });
  connection.close();
  finish?.({
    done: false,
    value: new TextEncoder().encode("event: change\ndata: {}\n\n"),
  });
  await rejected;
  reader.releaseLock();
  expect(cancel).toHaveBeenCalledOnce();
});
