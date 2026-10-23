import { BffError } from "./responses";
import { MAX_CSV_BYTES } from "@joint/contracts";

export async function readCsvBody(request: Request): Promise<ArrayBuffer> {
  if (
    !/^text\/csv(?:\s*;\s*charset\s*=\s*"?utf-8"?)?$/i.test(
      request.headers.get("content-type") ?? "",
    )
  ) {
    throw new BffError(
      415,
      "CSV_REQUIRED",
      "Choose a UTF-8 CSV file to continue.",
    );
  }
  const length = request.headers.get("content-length");
  if (length && (!/^\d+$/.test(length) || Number(length) > MAX_CSV_BYTES))
    throw new BffError(
      413,
      "CSV_TOO_LARGE",
      "Choose a CSV file of 10 MiB or less.",
    );
  const reader = request.body?.getReader();
  if (!reader)
    throw new BffError(
      400,
      "CSV_EMPTY",
      "Choose a CSV file with a header and data rows.",
    );
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_CSV_BYTES) {
        await reader.cancel();
        throw new BffError(
          413,
          "CSV_TOO_LARGE",
          "Choose a CSV file of 10 MiB or less.",
        );
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  if (!size)
    throw new BffError(
      400,
      "CSV_EMPTY",
      "Choose a CSV file with a header and data rows.",
    );
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes.buffer;
}
