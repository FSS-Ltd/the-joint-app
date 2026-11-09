import type { StatusSubscription } from "@joint/contracts";
import { NativeApiError } from "../../api/errors";
import type { NativeRequestOptions, NativeTransport } from "../../api/types";
import { readNativeStatusStream } from "../../events/stream";

export interface PrivacyStatusWatch<T> {
  selector: Extract<
    StatusSubscription,
    { kind: "export" | "archive-export" | "deletion" }
  >;
  transport: NativeTransport;
  authorization?: NativeRequestOptions["authorization"];
  read(signal: AbortSignal): Promise<T>;
  receive(value: T): void;
  unavailable(error?: unknown): void;
  failure(error: unknown): void;
}

export function isRetryablePrivacyStatusError(error: unknown): boolean {
  return (
    error instanceof NativeApiError &&
    error.code !== "INVALID_STATUS_STREAM" &&
    (error.status === 0 ||
      error.status >= 500 ||
      error.status === 408 ||
      error.status === 429)
  );
}

/** One export/deletion status resource, one SSE stream, coalesced reads and no recurring timer. */
export function watchPrivacyStatus<T>(
  resource: PrivacyStatusWatch<T>,
): () => void {
  let stopped = false;
  let epoch = 0;
  let retries = 0;
  let liveSince: number | null = null;
  let stream: AbortController | undefined;
  let read: AbortController | undefined;
  let activeRead = false;
  let pending = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  function detach(): void {
    epoch++;
    clearTimeout(timer);
    timer = undefined;
    stream?.abort();
    read?.abort();
    stream = undefined;
    read = undefined;
    activeRead = false;
    pending = false;
  }

  function close(): void {
    if (stopped) return;
    stopped = true;
    detach();
  }

  function lost(error: unknown): void {
    if (stopped) return;
    if (liveSince !== null && Date.now() - liveSince >= 30000) retries = 0;
    detach();
    resource.unavailable(
      error instanceof NativeApiError && error.status > 0 ? error : undefined,
    );
    if (stopped) return;
    if (!isRetryablePrivacyStatusError(error) || retries >= 5) {
      close();
      resource.failure(error);
      return;
    }
    const delay = 1000 * 2 ** retries++;
    timer = setTimeout(connect, delay);
  }

  function queueRead(current: number): void {
    if (stopped || current !== epoch) return;
    pending = true;
    if (activeRead) return;
    activeRead = true;
    pending = false;
    const controller = new AbortController();
    read = controller;
    void resource
      .read(controller.signal)
      .then(
        (value) => {
          if (!stopped && current === epoch && !controller.signal.aborted)
            resource.receive(value);
        },
        (error) => {
          if (!stopped && current === epoch && !controller.signal.aborted)
            lost(error);
        },
      )
      .finally(() => {
        if (stopped || current !== epoch) return;
        activeRead = false;
        if (pending) queueRead(current);
      });
  }

  function connect(): void {
    if (stopped) return;
    detach();
    liveSince = null;
    const current = epoch;
    const controller = new AbortController();
    stream = controller;
    void readNativeStatusStream(
      resource.selector,
      resource.transport,
      controller.signal,
      (value) => {
        if (stopped || current !== epoch) return;
        if (value === "change") {
          liveSince ??= Date.now();
          queueRead(current);
        } else if (value === "invalidate") {
          lost(new NativeApiError(404));
        } else {
          lost(new NativeApiError(0));
        }
      },
      resource.authorization,
    ).catch((error) => {
      if (!stopped && current === epoch) lost(error);
    });
  }

  connect();
  return close;
}
