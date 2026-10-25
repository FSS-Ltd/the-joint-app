import type { StatusSignal, StatusSubscription } from "@joint/contracts";
import { RequestError } from "../identity/client";
import { statusPath } from "./status-path";
import { readStatusStream } from "./status-stream";

interface StatusResource<T> {
  selector: StatusSubscription;
  read(signal: AbortSignal): Promise<T>;
  receive(value: T): void;
  unavailable(): void;
  failure(error: unknown): void;
}
const interrupted = (): RequestError =>
  new RequestError("Live updates interrupted. Retry status to reconnect.", 0);
function fatal(error: unknown): boolean {
  return (
    !(error instanceof RequestError) ||
    error.code === "INVALID_STATUS_STREAM" ||
    (error.status >= 400 &&
      error.status < 500 &&
      ![408, 429].includes(error.status))
  );
}

/** One resource, one stream, serial/coalesced reads and no recurring status timer. */
export function watchStatusResource<T>(
  resource: StatusResource<T>,
): () => void {
  const path = statusPath(resource.selector);
  let stopped = false,
    hidden = false,
    offline = navigator.onLine === false;
  let epoch = 0,
    retries = 0;
  let liveSince: number | null = null;
  let stream: AbortController | undefined, read: AbortController | undefined;
  let activeRead = false,
    pending = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  function detach(): void {
    epoch++;
    clearTimeout(timer);
    stream?.abort();
    read?.abort();
    activeRead = false;
    pending = false;
  }
  function close(): void {
    if (stopped) return;
    stopped = true;
    detach();
    window.removeEventListener("offline", wentOffline);
    window.removeEventListener("online", cameOnline);
    window.removeEventListener("pagehide", pageHidden);
    window.removeEventListener("pageshow", pageRestored);
  }
  function lost(error: unknown): void {
    if (stopped || hidden || offline) return;
    if (liveSince !== null && Date.now() - liveSince >= 30000) retries = 0;
    detach();
    resource.unavailable();
    if (stopped) return;
    if (fatal(error) || retries >= 5) {
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
          if (!stopped && current === epoch) resource.receive(value);
        },
        (error) => {
          if (!stopped && current === epoch) lost(error);
        },
      )
      .finally(() => {
        if (stopped || current !== epoch) return;
        activeRead = false;
        if (pending) queueRead(current);
      });
  }
  function connect(): void {
    if (stopped || hidden || offline) return;
    detach();
    liveSince = null;
    stream = new AbortController();
    const current = epoch;
    function signal(value: StatusSignal): void {
      if (stopped || current !== epoch) return;
      if (value === "change") {
        liveSince ??= Date.now();
        queueRead(current);
      } else if (value === "invalidate")
        lost(
          new RequestError(
            "This status is no longer available. Refresh your access and try again.",
            404,
          ),
        );
      else lost(interrupted());
    }
    void readStatusStream(path, stream.signal, signal).then(
      () => {
        if (!stopped && current === epoch) lost(interrupted());
      },
      (error) => {
        if (!stopped && current === epoch) lost(error);
      },
    );
  }
  function wentOffline(): void {
    if (stopped || offline) return;
    offline = true;
    detach();
    resource.unavailable();
  }
  function cameOnline(): void {
    if (stopped || !offline) return;
    offline = false;
    retries = 0;
    connect();
  }
  function pageHidden(): void {
    if (stopped || hidden) return;
    hidden = true;
    detach();
    resource.unavailable();
  }
  function pageRestored(event: PageTransitionEvent): void {
    if (stopped || !hidden || !event.persisted) return;
    hidden = false;
    retries = 0;
    connect();
  }
  window.addEventListener("offline", wentOffline);
  window.addEventListener("online", cameOnline);
  window.addEventListener("pagehide", pageHidden);
  window.addEventListener("pageshow", pageRestored);
  if (offline) resource.unavailable();
  else connect();
  return close;
}
