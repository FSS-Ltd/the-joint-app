import {
  idempotencyKeySchema,
  importCommitSchema,
  importReviewSchema,
  type ImportBatchResponse,
} from "@joint/contracts";
import type { NativeFinanceContextValue } from "../finance/context";
import { NativeApiError } from "../finance/errors";
import { assertActive, capturedAuthority } from "../accounts/write-intent";
import {
  importDecidable,
  type CommitInput,
  type ReviewInput,
} from "./review-input";

/** A response for another batch cannot be trusted even though the write may have landed. */
function sameBatch(
  value: ImportBatchResponse,
  batch: ImportBatchResponse,
): ImportBatchResponse {
  if (value.id !== batch.id || value.accountId !== batch.accountId)
    throw new NativeApiError(409, "RESOURCE_MISMATCH", "uncertain");
  return value;
}
/** Freezes the decisions and batch version so each retry replays identical bytes. */
export function reviewIntent(
  finance: NativeFinanceContextValue,
  batch: ImportBatchResponse,
  input: ReviewInput,
): (signal: AbortSignal) => Promise<ImportBatchResponse> {
  const authority = capturedAuthority(finance);
  if (!importDecidable(batch))
    throw new NativeApiError(403, "AUTHORITY_CHANGED");
  const parsed = importReviewSchema.parse(input);
  const dto = Object.freeze({
    decisions: Object.freeze(
      parsed.decisions.map((row) => Object.freeze({ ...row })),
    ),
  });
  const { id, version } = batch;
  return async (signal) => {
    assertActive(finance, authority, signal);
    return sameBatch(
      await finance.imports.review(
        authority.householdId,
        id,
        dto,
        version,
        signal,
      ),
      batch,
    );
  };
}
/** The commit key is minted once per submission and replayed with the same body and version. */
export function commitIntent(
  finance: NativeFinanceContextValue,
  batch: ImportBatchResponse,
  input: CommitInput,
  requestKey: string,
): (signal: AbortSignal) => Promise<ImportBatchResponse> {
  const authority = capturedAuthority(finance);
  if (!importDecidable(batch))
    throw new NativeApiError(403, "AUTHORITY_CHANGED");
  const dto = Object.freeze(importCommitSchema.parse(input));
  const key = idempotencyKeySchema.parse(requestKey);
  const { id, version } = batch;
  return async (signal) => {
    assertActive(finance, authority, signal);
    const result = await finance.imports.commit(
      authority.householdId,
      id,
      dto,
      key,
      version,
      signal,
    );
    return sameBatch(result.batch, batch);
  };
}
