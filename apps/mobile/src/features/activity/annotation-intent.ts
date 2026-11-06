import {
  transactionAnnotationSchema,
  type TransactionResponse,
} from "@joint/contracts";
import type { NativeFinanceContextValue } from "../finance/context";
import { NativeApiError } from "../finance/errors";
import { assertActive, capturedAuthority } from "../accounts/write-intent";
import { annotationFields, type AnnotationInput } from "./annotation-input";

/** Freezes the DTO and row version so every retry replays identical bytes. */
export function annotationWriteIntent(
  finance: NativeFinanceContextValue,
  transaction: TransactionResponse,
  input: AnnotationInput,
): (signal: AbortSignal) => Promise<TransactionResponse> {
  const authority = capturedAuthority(finance);
  const open = annotationFields(transaction);
  const dto = Object.freeze(transactionAnnotationSchema.parse(input));
  if (
    ((dto.category !== undefined || dto.classificationKind !== undefined) &&
      !open.classification) ||
    (dto.merchant !== undefined && !open.merchant) ||
    (dto.note !== undefined && !open.note)
  )
    throw new NativeApiError(403, "AUTHORITY_CHANGED");
  const { id, accountId, version } = transaction;
  return async (signal) => {
    assertActive(finance, authority, signal);
    const value = await finance.transactions.annotate(
      authority.householdId,
      id,
      dto,
      version,
      signal,
    );
    // A dispatched write may have committed even when its response is untrustworthy.
    if (value.id !== id || value.accountId !== accountId)
      throw new NativeApiError(409, "RESOURCE_MISMATCH", "uncertain");
    return value;
  };
}
