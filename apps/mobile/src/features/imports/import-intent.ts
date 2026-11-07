import {
  csvMappingSchema,
  idempotencyKeySchema,
  type AccountResponse,
  type CsvMapping,
  type ImportBatchResponse,
} from "@joint/contracts";
import type { NativeFinanceContextValue } from "../finance/context";
import { NativeApiError } from "../finance/errors";
import { assertActive, capturedAuthority } from "../accounts/write-intent";

/**
 * Freezes the file bytes, mapping and key so every retry replays an identical upload.
 * A new file or mapping must use a new key, so the caller mints one per submission.
 */
export function previewIntent(
  finance: NativeFinanceContextValue,
  account: AccountResponse,
  bytes: Uint8Array<ArrayBuffer>,
  mapping: CsvMapping,
  requestKey: string,
): (signal: AbortSignal) => Promise<ImportBatchResponse> {
  const authority = capturedAuthority(finance);
  if (
    account.householdId !== authority.householdId ||
    account.ownership !== "OWNED"
  )
    throw new NativeApiError(403, "AUTHORITY_CHANGED");
  const dto = Object.freeze(csvMappingSchema.parse(mapping));
  const key = idempotencyKeySchema.parse(requestKey);
  const snapshot = bytes.slice();
  const accountId = account.id;
  return async (signal) => {
    assertActive(finance, authority, signal);
    const result = await finance.imports.preview(
      authority.householdId,
      accountId,
      snapshot,
      dto,
      key,
      signal,
    );
    // A dispatched upload may have created a batch even when its response is untrustworthy.
    if (result.batch.accountId !== accountId)
      throw new NativeApiError(409, "RESOURCE_MISMATCH", "uncertain");
    return result.batch;
  };
}
