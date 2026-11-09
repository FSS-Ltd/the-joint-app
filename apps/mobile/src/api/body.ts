import { MAX_CSV_BYTES } from "@joint/contracts";
import { NativeApiError } from "./errors";
import type { RequestLifetime } from "./lifetime";
import type { NativeBody, NativeResponse } from "./types";

export const maximumJsonBytes = 1048576;
export const maximumCsvDownloadBytes = MAX_CSV_BYTES;

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

export async function readCsvBytesBody(
  response: NativeResponse,
  lifetime: RequestLifetime,
): Promise<Uint8Array<ArrayBuffer>> {
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
    if (length !== null && Number(length) > maximumCsvDownloadBytes)
      throw new NativeApiError(0);
    const decoder = new TextDecoder("utf-8", { fatal: true });
    const chunks: Uint8Array[] = [];
    let bytes = 0;
    while (true) {
      const chunk = await lifetime.wait(reader.read());
      lifetime.check();
      if (chunk.done) break;
      if (!chunk.value) throw new NativeApiError(0);
      bytes += chunk.value.byteLength;
      if (bytes > maximumCsvDownloadBytes) throw new NativeApiError(0);
      decoder.decode(chunk.value, { stream: true });
      chunks.push(chunk.value);
    }
    decoder.decode();
    if (bytes === 0) throw new NativeApiError(0);
    const combined = new Uint8Array(new ArrayBuffer(bytes));
    let offset = 0;
    for (const part of chunks) {
      combined.set(part, offset);
      offset += part.byteLength;
    }
    return combined;
  } catch (error) {
    cancel();
    throw error;
  } finally {
    lifetime.controller.signal.removeEventListener("abort", cancel);
    reader.releaseLock();
  }
}
