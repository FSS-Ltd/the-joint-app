import type { StatusSignal } from "@joint/contracts";
import { createStatusDecoder } from "../../lib/status-protocol";
import { RequestError } from "../identity/client";

const protocolError = (): RequestError =>
  new RequestError(
    "Live updates could not be verified. Retry status to reconnect.",
    502,
    "INVALID_STATUS_STREAM",
  );

/** A transport watchdog only: no timer in this reader queries resource state. */
export async function readStatusStream(
  path: string,
  signal: AbortSignal,
  onSignal: (signal: StatusSignal) => void,
): Promise<void> {
  if (
    !path.startsWith("/api/") ||
    new URL(path, window.location.origin).origin !== window.location.origin
  )
    throw new RequestError("This status is unavailable.", 400);
  const closed = (): DOMException =>
    new DOMException("Status stream closed", "AbortError");
  if (signal.aborted) throw closed();
  const network = new AbortController();
  const cancel = (): void => network.abort();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let body: ReadableStream<Uint8Array> | null = null;
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  function deadline(milliseconds: number): void {
    clearTimeout(timer);
    timer = setTimeout(cancel, milliseconds);
  }
  signal.addEventListener("abort", cancel, { once: true });
  if (signal.aborted) cancel();
  deadline(10000);
  try {
    const response = await fetch(path, {
      credentials: "same-origin",
      cache: "no-store",
      redirect: "error",
      headers: { Accept: "text/event-stream" },
      signal: network.signal,
    });
    body = response.body;
    if (signal.aborted) throw closed();
    if (!response.ok)
      throw new RequestError(
        response.status === 401
          ? "Sign in again to continue."
          : "Live status is unavailable or your access changed. Retry after refreshing your access.",
        response.status,
      );
    if (
      !body ||
      response.headers.get("content-type")?.split(";")[0]?.trim() !==
        "text/event-stream"
    )
      throw protocolError();
    reader = body.getReader();
    const decoder = createStatusDecoder(onSignal);
    deadline(45000);
    while (!signal.aborted) {
      const value = await reader.read();
      if (signal.aborted) throw closed();
      try {
        if (value.done) decoder.finish();
        else if (decoder.push(value.value)) deadline(45000);
      } catch {
        throw protocolError();
      }
      if (value.done) break;
    }
    throw new RequestError(
      "Live updates interrupted. Retry status to reconnect.",
      0,
    );
  } catch (error) {
    if (signal.aborted) throw closed();
    if (error instanceof RequestError) throw error;
    throw new RequestError(
      "Live updates interrupted. Retry status to reconnect.",
      0,
    );
  } finally {
    clearTimeout(timer);
    signal.removeEventListener("abort", cancel);
    network.abort();
    if (reader) await reader.cancel().catch(() => {});
    else await body?.cancel().catch(() => {});
  }
}
