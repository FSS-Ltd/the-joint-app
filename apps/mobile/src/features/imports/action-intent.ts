import {
  idempotencyKeySchema,
  type ImportBatchResponse,
} from "@joint/contracts";
import type { NativeFinanceContextValue } from "../finance/context";
import { NativeApiError } from "../finance/errors";
import { assertActive, capturedAuthority } from "../accounts/write-intent";
import { actionAllowed, type ImportAction } from "./action-input";

type Intent = (signal: AbortSignal) => Promise<ImportBatchResponse>;
/** A response for another batch cannot be trusted even though the write may have landed. */
function sameBatch(
  value: ImportBatchResponse,
  batch: ImportBatchResponse,
): ImportBatchResponse {
  if (value.id !== batch.id || value.accountId !== batch.accountId)
    throw new NativeApiError(409, "RESOURCE_MISMATCH", "uncertain");
  return value;
}
/**
 * Rollback and original deletion carry only the batch version; restore is the commit
 * route with a key minted once per submission. Retries replay the same closure.
 */
export function actionIntent(
  finance: NativeFinanceContextValue,
  batch: ImportBatchResponse,
  action: ImportAction,
  requestKey?: string,
): Intent {
  const authority = capturedAuthority(finance);
  if (!actionAllowed(batch, action))
    throw new NativeApiError(403, "AUTHORITY_CHANGED");
  const { id, version } = batch;
  const key =
    action === "restore" ? idempotencyKeySchema.parse(requestKey) : undefined;
  return async (signal) => {
    assertActive(finance, authority, signal);
    const imports = finance.imports;
    if (action === "rollback")
      return sameBatch(
        await imports.rollback(authority.householdId, id, version, signal),
        batch,
      );
    if (action === "original")
      return sameBatch(
        await imports.deleteOriginal(
          authority.householdId,
          id,
          version,
          signal,
        ),
        batch,
      );
    const result = await imports.commit(
      authority.householdId,
      id,
      { acceptRejectedRows: false },
      key as string,
      version,
      signal,
    );
    return sameBatch(result.batch, batch);
  };
}
