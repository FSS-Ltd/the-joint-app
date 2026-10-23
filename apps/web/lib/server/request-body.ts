import { BffError, type Schema } from "./responses";

export async function requestBody<T>(
  request: Request,
  schema: Schema<T>,
): Promise<T> {
  if (
    request.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase() !==
    "application/json"
  ) {
    throw new BffError(
      415,
      "JSON_REQUIRED",
      "Please send this request as JSON.",
    );
  }
  const reader = request.body?.getReader();
  if (!reader)
    throw new BffError(
      400,
      "INVALID_INPUT",
      "Check the details and try again.",
    );
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 8192) {
        await reader.cancel();
        throw new BffError(
          413,
          "INPUT_TOO_LARGE",
          "This request is too large.",
        );
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  let value: unknown;
  try {
    value = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new BffError(
      400,
      "INVALID_INPUT",
      "Check the details and try again.",
    );
  }
  const result = schema.safeParse(value);
  if (!result.success)
    throw new BffError(
      400,
      "INVALID_INPUT",
      "Check the details and try again.",
    );
  return result.data;
}
