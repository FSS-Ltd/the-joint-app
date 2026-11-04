import {
  createStatusDecoder,
  type StatusSignal,
  type StatusSubscription,
} from "@joint/contracts";
import { NativeApiError } from "../api/errors";
import type {
  NativeReader,
  NativeStatusConnection,
  NativeTransport,
} from "../api/types";

const invalid = (): NativeApiError =>
  new NativeApiError(502, "INVALID_STATUS_STREAM");

/** Transport liveness only: validated frames never discover resource state. */
export async function readNativeStatusStream(
  selector: StatusSubscription,
  transport: NativeTransport,
  signal: AbortSignal,
  onSignal: (signal: StatusSignal) => void,
): Promise<void> {
  if (signal.aborted) throw new NativeApiError(0);
  if (
    selector.kind !== "account" &&
    selector.kind !== "accounts" &&
    selector.kind !== "wealth"
  )
    throw new NativeApiError(400, "INVALID_STATUS_SELECTOR");
  const network = new AbortController();
  let connection: NativeStatusConnection | undefined;
  let reader: NativeReader | undefined;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const cancel = () => {
    clearTimeout(timeout);
    network.abort();
  };
  const deadline = () => {
    clearTimeout(timeout);
    timeout = setTimeout(cancel, 45000);
  };
  const check = () => {
    if (network.signal.aborted) throw new NativeApiError(0);
  };
  signal.addEventListener("abort", cancel, { once: true });
  try {
    // openStatus owns the 15000ms token/handshake deadline, not the stream lifetime.
    connection = await transport.openStatus(selector, network.signal);
    check();
    const { response } = connection;
    if (response.status < 200 || response.status >= 300)
      throw new NativeApiError(response.status);
    if (
      !response.body ||
      response.headers
        .get("content-type")
        ?.split(";")[0]
        ?.trim()
        .toLowerCase() !== "text/event-stream"
    )
      throw invalid();
    reader = response.body.getReader();
    const decoder = createStatusDecoder((value) => {
      if (!network.signal.aborted) onSignal(value);
    });
    deadline();
    while (!network.signal.aborted) {
      const chunk = await reader.read();
      check();
      try {
        if (chunk.done) decoder.finish();
        else if (chunk.value && decoder.push(chunk.value)) {
          if (!network.signal.aborted) deadline();
        }
      } catch {
        throw invalid();
      }
      if (chunk.done) break;
    }
    throw new NativeApiError(0);
  } catch (error) {
    if (network.signal.aborted) throw new NativeApiError(0);
    if (error instanceof NativeApiError) throw error;
    throw new NativeApiError(0);
  } finally {
    clearTimeout(timeout);
    signal.removeEventListener("abort", cancel);
    // close synchronously cancels the owned reader; release even on protocol failure.
    connection?.close();
    network.abort();
    reader?.releaseLock();
  }
}
