import {
  transferConfirmSchema,
  transferRemoveSchema,
  type TransactionResponse,
} from "@joint/contracts";
import type { InputResult } from "../accounts/write-input";

export type TransferConfirmInput = ReturnType<
  typeof transferConfirmSchema.parse
>;
export type TransferRemoveInput = ReturnType<typeof transferRemoveSchema.parse>;
/** The pair as read from the server; versions are bound to the open row below. */
export interface TransferPair {
  id: string;
  from: TransactionResponse;
  to: TransactionResponse;
}

/** Owners may pair an unpaired, unsplit, non-zero row; the server enforces the same rules. */
export function transferLinkAllowed(transaction: TransactionResponse): boolean {
  return (
    transaction.permissions.canClassify &&
    transaction.transfer?.confirmed !== true &&
    transaction.splits.length === 0 &&
    BigInt(transaction.money.amountMinor) !== 0n
  );
}
export function transferRemovable(transaction: TransactionResponse): boolean {
  return (
    transaction.transfer?.confirmed === true &&
    transaction.transfer.canRemove &&
    transaction.transfer.id !== null
  );
}
/** Exact opposite GBP amounts in another account, both entries free of any pairing or split. */
export function isTransferCandidate(
  transaction: TransactionResponse,
  other: TransactionResponse,
): boolean {
  return (
    other.id !== transaction.id &&
    other.accountId !== transaction.accountId &&
    other.money.currency === "GBP" &&
    transaction.money.currency === "GBP" &&
    BigInt(other.money.amountMinor) ===
      -BigInt(transaction.money.amountMinor) &&
    other.transfer?.confirmed !== true &&
    other.splits.length === 0
  );
}
const unavailable =
  "These entries can no longer be paired. Reload and choose again.";
export function transferConfirmInput(
  transaction: TransactionResponse,
  other: TransactionResponse,
): InputResult<TransferConfirmInput> {
  if (
    !transferLinkAllowed(transaction) ||
    !isTransferCandidate(transaction, other)
  )
    return { ok: false, message: unavailable };
  const [from, to] =
    BigInt(transaction.money.amountMinor) < 0n
      ? [transaction, other]
      : [other, transaction];
  const parsed = transferConfirmSchema.safeParse({
    fromTransactionId: from.id,
    toTransactionId: to.id,
    fromVersion: from.version,
    toVersion: to.version,
  });
  return parsed.success
    ? { ok: true, value: parsed.data }
    : { ok: false, message: unavailable };
}
/** Versions come from the pair, which must agree with the open row so no unseen version is sent. */
export function transferRemoveInput(
  transaction: TransactionResponse,
  pair: TransferPair,
): InputResult<TransferRemoveInput> {
  const mine = pair.from.id === transaction.id ? pair.from : pair.to;
  const parsed = transferRemoveSchema.safeParse({
    fromVersion: pair.from.version,
    toVersion: pair.to.version,
  });
  if (
    !transferRemovable(transaction) ||
    pair.id !== transaction.transfer?.id ||
    mine.id !== transaction.id ||
    mine.version !== transaction.version ||
    !parsed.success
  )
    return {
      ok: false,
      message: "This transfer changed. Reload and try again.",
    };
  return { ok: true, value: parsed.data };
}
