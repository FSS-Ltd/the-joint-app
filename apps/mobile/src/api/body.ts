import { NativeApiError } from "./errors";
import type { RequestLifetime } from "./lifetime";
import type { NativeBody, NativeResponse } from "./types";

export const maximumJsonBytes = 1048576;

export function discardBody(body: Pick<NativeBody, "cancel"> | null): void {
  // Cancellation is best effort: an injected/native reader may already be closed.
  try {
    void body?.cancel().catch(() => {});
  } catch {
    /* Already disposed. */
  }
}

export async function readJson(
  response: NativeResponse,
  lifetime: RequestLifetime,
): Promise<unknown> {
  if (!response.body) throw new NativeApiError(0);
  const reader = response.body.getReader();
  let cancelled = false;
  const cancel = () => {
    if (cancelled) return;
    cancelled = true;
    discardBody(reader);
  };
  lifetime.controller.signal.addEventListener("abort", cancel, { once: true });
  try {
    lifetime.check();
    const length = response.headers.get("Content-Length");
    if (length !== null && Number(length) > maximumJsonBytes)
      throw new NativeApiError(0);
    const decoder = new TextDecoder("utf-8", { fatal: true });
    let bytes = 0;
    let text = "";
    while (true) {
      const chunk = await lifetime.wait(reader.read());
      lifetime.check();
      if (chunk.done) break;
      if (!chunk.value) throw new NativeApiError(0);
      bytes += chunk.value.byteLength;
      if (bytes > maximumJsonBytes) throw new NativeApiError(0);
      text += decoder.decode(chunk.value, { stream: true });
    }
    text += decoder.decode();
    return JSON.parse(text) as unknown;
  } catch (error) {
    cancel();
    throw error;
  } finally {
    lifetime.controller.signal.removeEventListener("abort", cancel);
    reader.releaseLock();
  }
}
