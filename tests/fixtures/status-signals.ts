import type { Page } from "@playwright/test";
import type { StatusSignal } from "../../packages/contracts/src/events.js";

interface StatusCounters {
  opened: number;
  closed: number;
  signals: number;
  errors: string[];
}
declare global {
  interface Window {
    __jointSyntheticStatus?: StatusCounters;
  }
}

/** Presentation-only fixtures: finite route.fulfill bodies cannot model idle SSE. */
export async function installStatusSignals(page: Page): Promise<void> {
  await page.addInitScript(() => {
    if ("__jointSyntheticStatus" in window) return;
    const counters: StatusCounters = {
      opened: 0,
      closed: 0,
      signals: 0,
      errors: [],
    };
    Object.defineProperty(window, "__jointSyntheticStatus", {
      value: counters,
    });
    window.addEventListener("error", (event) =>
      counters.errors.push(event.message.slice(0, 200)),
    );
    const original = window.fetch.bind(window);
    window.fetch = async (input, options) => {
      const url = new URL(
        input instanceof Request ? input.url : String(input),
        window.location.href,
      );
      if (
        url.origin !== window.location.origin ||
        (url.pathname !== "/api/events" &&
          !/^\/api\/privacy\/deletion-requests\/[^/]+\/events$/.test(
            url.pathname,
          ))
      )
        return original(input, options);
      counters.opened++;
      let cleanup = (): void => {};
      const body = new ReadableStream<Uint8Array>({
        start(controller): void {
          let closed = false;
          const encoder = new TextEncoder();
          const frame = (value: string): void => {
            if (!closed) controller.enqueue(encoder.encode(value));
          };
          const publish = (signal: string): void => {
            if (!closed) {
              counters.signals++;
              frame(`event: ${signal}\ndata: {}\n\n`);
            }
          };
          const abort = (): void => {
            if (!closed) {
              cleanup();
              controller.close();
            }
          };
          const message = (event: Event): void => {
            if (!(event instanceof CustomEvent)) return;
            const detail: unknown = event.detail;
            if (
              typeof detail !== "object" ||
              detail === null ||
              !("signal" in detail) ||
              typeof detail.signal !== "string"
            )
              return;
            if (
              "pathIncludes" in detail &&
              typeof detail.pathIncludes === "string" &&
              !url.href.includes(detail.pathIncludes)
            )
              return;
            if (detail.signal === "disconnect") {
              cleanup();
              controller.error(new TypeError("Synthetic disconnect"));
            } else if (
              ["change", "invalidate", "renew", "reconnect"].includes(
                detail.signal,
              )
            )
              publish(detail.signal);
          };
          const heartbeat = setInterval(() => frame(": keepalive\n\n"), 15000);
          cleanup = (): void => {
            if (closed) return;
            closed = true;
            counters.closed++;
            clearInterval(heartbeat);
            window.removeEventListener("joint-test-status", message);
            options?.signal?.removeEventListener("abort", abort);
          };
          window.addEventListener("joint-test-status", message);
          options?.signal?.addEventListener("abort", abort, { once: true });
          if (options?.signal?.aborted) abort();
          else publish("change");
        },
        cancel(): void {
          cleanup();
        },
      });
      return new Response(body, {
        headers: { "Content-Type": "text/event-stream" },
      });
    };
  });
}
export async function emitStatusSignal(
  page: Page,
  signal: StatusSignal | "disconnect",
  pathIncludes?: string,
): Promise<void> {
  await page.evaluate(
    (detail) =>
      window.dispatchEvent(new CustomEvent("joint-test-status", { detail })),
    { signal, pathIncludes },
  );
}

export async function statusSignalCounts(
  page: Page,
): Promise<StatusCounters | null> {
  return page.evaluate(() =>
    window.__jointSyntheticStatus ? { ...window.__jointSyntheticStatus } : null,
  );
}
