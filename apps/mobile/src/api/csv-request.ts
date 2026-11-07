import { idempotencyKeySchema, MAX_CSV_BYTES } from "@joint/contracts";
import { NativeApiError } from "./errors";
import type { NativeCsvUpload } from "./types";

const maximumMappingHeader = 8192;
// encodeURIComponent output only; anything else could smuggle header syntax.
const encodedMapping = /^[A-Za-z0-9\-_.!~*'()%]+$/;

/** Validates an upload locally so oversize or malformed input never reaches the network. */
export function csvRequest(csv: NativeCsvUpload): {
  headers: Record<string, string>;
  body: Uint8Array<ArrayBuffer>;
} {
  if (csv.bytes.byteLength === 0 || csv.bytes.byteLength > MAX_CSV_BYTES)
    throw new NativeApiError(0);
  const headers: Record<string, string> = {
    "Content-Type": "text/csv; charset=UTF-8",
    // The server validates this header with the same UUID-shaped schema.
    "X-Account-Id": idempotencyKeySchema.parse(csv.accountId),
  };
  if (csv.mapping !== undefined) {
    if (
      csv.mapping.length > maximumMappingHeader ||
      !encodedMapping.test(csv.mapping)
    )
      throw new NativeApiError(0);
    headers["X-Import-Mapping"] = csv.mapping;
  }
  // Copied here, before any await in the caller, so later mutation cannot change what is sent.
  return { headers, body: csv.bytes.slice() };
}
