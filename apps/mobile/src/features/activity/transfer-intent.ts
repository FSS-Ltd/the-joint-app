import {
  idempotencyKeySchema,
  transferConfirmSchema,
  transferRemoveSchema,
  type TransactionResponse,
} from "@joint/contracts";
import type { NativeFinanceContextValue } from "../finance/context";
import { NativeApiError } from "../finance/errors";
import { assertActive, capturedAuthority } from "../accounts/write-intent";
import {
  transferLinkAllowed,
  transferRemovable,
  type TransferConfirmInput,
  type TransferRemoveInput,
} from "./transfer-input";

type Pair = { from: TransactionResponse; to: TransactionResponse };
/** A write may have committed even when its response is untrustworthy for this row. */
function legOf(pair: Pair, id: string, accountId: string): TransactionResponse {
  const leg =
    pair.from.id === id ? pair.from : pair.to.id === id ? pair.to : null;
  if (!leg || leg.accountId !== accountId)
    throw new NativeApiError(409, "RESOURCE_MISMATCH", "uncertain");
  return leg;
}
export function transferConfirmIntent(
  finance: NativeFinanceContextValue,
  transaction: TransactionResponse,
  input: TransferConfirmInput,
  requestKey: string,
): (signal: AbortSignal) => Promise<TransactionResponse> {
  const authority = capturedAuthority(finance);
  if (!transferLinkAllowed(transaction))
    throw new NativeApiError(403, "AUTHORITY_CHANGED");
  const dto = Object.freeze(transferConfirmSchema.parse(input));
  const key = idempotencyKeySchema.parse(requestKey);
  const { id, accountId } = transaction;
  return async (signal) => {
    assertActive(finance, authority, signal);
    const pair = await finance.transactions.confirmTransfer(
      authority.householdId,
      dto,
      key,
      signal,
    );
    return legOf(pair, id, accountId);
  };
}
export function transferRemoveIntent(
  finance: NativeFinanceContextValue,
  transaction: TransactionResponse,
  input: TransferRemoveInput,
): (signal: AbortSignal) => Promise<TransactionResponse> {
  const authority = capturedAuthority(finance);
  const transferId = transaction.transfer?.id;
  if (!transferRemovable(transaction) || !transferId)
    throw new NativeApiError(403, "AUTHORITY_CHANGED");
  const dto = Object.freeze(transferRemoveSchema.parse(input));
  const { id, accountId } = transaction;
  return async (signal) => {
    assertActive(finance, authority, signal);
    const pair = await finance.transactions.removeTransfer(
      authority.householdId,
      transferId,
      dto,
      signal,
    );
    return legOf(pair, id, accountId);
  };
}
