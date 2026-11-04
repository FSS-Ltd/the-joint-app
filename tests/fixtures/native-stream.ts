import { vi } from "vitest";
import { createNativeTransport } from "./native-api.js";
import type { NativeSend } from "../../apps/mobile/src/api/types.js";

export const householdId: string = "00000000-0000-4000-8000-000000000001";
export const selector = { kind: "accounts", householdId, limit: 50 } as const;
export const scope = {
  actor: "provider-user:provider-session",
  userId: "00000000-0000-4000-8000-000000000002",
  membershipId: "00000000-0000-4000-8000-000000000003",
  householdId,
  grantVersion: 0,
  selector,
};
export const flush = () => vi.advanceTimersByTimeAsync(0);
export function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}
export function nativeWire(getToken = async () => "synthetic-token") {
  const connections: {
    wire: ReadableStreamDefaultController<Uint8Array>;
    signal: AbortSignal;
    cancel: ReturnType<typeof vi.fn>;
  }[] = [];
  const send = vi.fn<NativeSend>(async (_url, options) => {
    const cancel = vi.fn();
    const body = new ReadableStream<Uint8Array>({
      start(wire) {
        connections.push({ wire, signal: options.signal, cancel });
      },
      cancel,
    });
    return new Response(body, {
      headers: { "Content-Type": "text/event-stream; charset=utf-8" },
    });
  });
  const transport = createNativeTransport(
    "https://synthetic.example.test",
    getToken,
    send,
  );
  function emit(text: string, index = connections.length - 1) {
    const connection = connections[index];
    if (!connection) throw Error("No connection");
    connection.wire.enqueue(new TextEncoder().encode(text));
  }
  return { transport, connections, send, emit };
}
