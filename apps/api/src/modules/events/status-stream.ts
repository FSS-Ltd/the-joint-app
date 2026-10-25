import type { ServerResponse } from "node:http";
import { HttpException } from "@nestjs/common";
import { isAuthorityUnavailable } from "../../authority-errors.js";
import {
  authorizeStatusObserver,
  type StatusEventSource,
  type StatusSnapshot,
} from "./status-observer.js";

/** Only empty protocol signals leave the API. Authorization finishes before headers. */
export async function openStatusStream(
  response: ServerResponse,
  options: { source: StatusEventSource; read: () => Promise<StatusSnapshot> },
): Promise<void> {
  if (response.destroyed || response.writableEnded) return;
  const abort = new AbortController();
  let streaming = false;
  let heartbeat: ReturnType<typeof setInterval> | undefined;
  const cleanup = (): void => {
    clearInterval(heartbeat);
    response.off("close", stop);
    response.off("error", stop);
  };
  const stop = (): void => {
    abort.abort();
    cleanup();
  };
  response.once("close", stop);
  response.once("error", stop);
  const write = (frame: string): boolean => {
    if (response.destroyed || response.writableEnded) return false;
    try {
      if (response.write(frame)) return true;
    } catch {
      // Socket errors terminate this stream; no exception data reaches the client.
    }
    response.destroy();
    return false;
  };
  try {
    const observer = await authorizeStatusObserver({
      ...options,
      signal: abort.signal,
      denied: (error) =>
        isAuthorityUnavailable(error) ||
        (error instanceof HttpException &&
          [400, 401, 403, 404, 409].includes(error.getStatus())),
      send: (event) => write(`event: ${event}\ndata: {}\n\n`),
      close: () => {
        clearInterval(heartbeat);
        if (streaming && !response.destroyed && !response.writableEnded)
          response.end();
      },
    });
    if (response.destroyed || abort.signal.aborted) {
      observer.close();
      return;
    }
    response.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    response.setHeader("Cache-Control", "no-store");
    response.setHeader("X-Accel-Buffering", "no");
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.flushHeaders();
    streaming = true;
    observer.start();
    if (!response.destroyed && !response.writableEnded)
      heartbeat = setInterval(() => {
        if (!write(": keepalive\n\n")) stop();
      }, 15000);
  } catch (error) {
    cleanup();
    if (!abort.signal.aborted && !response.destroyed) throw error;
  }
}
