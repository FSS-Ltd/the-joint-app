import { readEnvironment, webEnvironmentSchema } from "@joint/contracts";
import { BffError } from "./responses";
import { createStatusDecoder } from "./status-protocol";

/** Bound the handshake, not the stream lifetime; browser cancellation owns cleanup. */
export async function statusUpstream(
  request: Request,
  query: URLSearchParams,
  authorization: string,
): Promise<Response> {
  if (request.signal.aborted)
    throw new BffError(
      503,
      "UNAVAILABLE",
      "Live updates are unavailable. Retry shortly.",
    );
  const env = readEnvironment(webEnvironmentSchema, process.env);
  const url = new URL("/v1/events", env.API_BASE_URL);
  url.search = query.toString();
  const abort = new AbortController();
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  let downstream: ReadableStreamDefaultController<Uint8Array> | undefined;
  let finished = false;
  const timeout = setTimeout(() => abort.abort(), 10000);
  const cleanup = (): void => {
    clearTimeout(timeout);
    request.signal.removeEventListener("abort", aborted);
  };
  const cancel = (): boolean => {
    if (finished) return false;
    finished = true;
    abort.abort();
    void reader?.cancel().catch(() => {});
    cleanup();
    return true;
  };
  const aborted = (): void => {
    if (cancel()) downstream?.close();
  };
  request.signal.addEventListener("abort", aborted, { once: true });
  if (request.signal.aborted) aborted();
  try {
    const response = await fetch(url, {
      headers: { Authorization: authorization, Accept: "text/event-stream" },
      cache: "no-store",
      redirect: "error",
      signal: abort.signal,
    });
    clearTimeout(timeout);
    if (finished || abort.signal.aborted) {
      await response.body?.cancel();
      throw new BffError(
        503,
        "UNAVAILABLE",
        "Live updates are unavailable. Retry shortly.",
      );
    }
    if (
      !response.ok ||
      !response.body ||
      response.headers
        .get("content-type")
        ?.split(";")[0]
        ?.trim()
        .toLowerCase() !== "text/event-stream"
    ) {
      await response.body?.cancel();
      const status = [400, 401, 403, 404, 409, 429].includes(response.status)
        ? response.status
        : 503;
      throw new BffError(
        status,
        status === 401 ? "SIGN_IN_REQUIRED" : "UNAVAILABLE",
        status === 401
          ? "Sign in again to continue."
          : "Live updates are unavailable. Refresh this page or retry shortly.",
      );
    }
    reader = response.body.getReader();
    const upstream = reader;
    const decoder = createStatusDecoder();
    return new Response(
      new ReadableStream<Uint8Array>({
        start(controller): void {
          downstream = controller;
        },
        async pull(controller): Promise<void> {
          try {
            while (!finished) {
              const result = await upstream.read();
              if (finished) return;
              if (result.done) {
                decoder.finish();
                finished = true;
                cleanup();
                controller.close();
                return;
              }
              const data = decoder.push(result.value);
              if (data) {
                controller.enqueue(data);
                return;
              }
            }
          } catch {
            if (!finished) {
              cancel();
              controller.error(new Error("Status stream unavailable"));
            }
          }
        },
        async cancel(): Promise<void> {
          cancel();
          await upstream.cancel().catch(() => {});
        },
      }),
      {
        headers: {
          "Content-Type": "text/event-stream; charset=utf-8",
          "Cache-Control": "no-store",
          Vary: "Cookie",
          "X-Accel-Buffering": "no",
          "X-Content-Type-Options": "nosniff",
        },
      },
    );
  } catch (error) {
    cancel();
    throw error;
  }
}
