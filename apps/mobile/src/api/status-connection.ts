import { discardBody } from "./body";
import type { RequestLifetime } from "./lifetime";
import type {
  NativeReader,
  NativeResponse,
  NativeStatusConnection,
} from "./types";

/** Own the stream socket and reader cancellation, leaving protocol decoding to the consumer. */
export function statusConnection(
  response: NativeResponse,
  lifetime: RequestLifetime,
): NativeStatusConnection {
  let reader: NativeReader | null = null;
  let closed = false;
  const signal = lifetime.controller.signal;
  const close = () => {
    if (closed) return;
    closed = true;
    signal.removeEventListener("abort", close);
    lifetime.close();
    discardBody(reader ?? response.body);
    reader = null;
  };
  signal.addEventListener("abort", close, { once: true });
  if (signal.aborted) close();
  lifetime.check();
  const body = response.body;
  return {
    response: {
      status: response.status,
      headers: response.headers,
      body:
        body === null
          ? null
          : {
              getReader() {
                lifetime.check();
                const current = body.getReader();
                reader = current;
                return {
                  async read() {
                    lifetime.check();
                    const chunk = await lifetime.wait(current.read());
                    lifetime.check();
                    return chunk;
                  },
                  cancel: () => current.cancel(),
                  releaseLock() {
                    current.releaseLock();
                    if (reader === current) reader = null;
                  },
                };
              },
              cancel: async () => {
                close();
              },
            },
    },
    close,
  };
}
