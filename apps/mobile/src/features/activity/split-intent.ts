import {
  transactionSplitsSchema,
  type TransactionResponse,
} from "@joint/contracts";
import type { NativeFinanceContextValue } from "../finance/context";
import { NativeApiError } from "../finance/errors";
import { assertActive, capturedAuthority } from "../accounts/write-intent";
import { splitsAllowed, type SplitsInput } from "./split-input";

/** Freezes every line and the row version so each retry replays identical bytes. */
export function splitsWriteIntent(
  finance: NativeFinanceContextValue,
  transaction: TransactionResponse,
  input: SplitsInput,
): (signal: AbortSignal) => Promise<TransactionResponse> {
  const authority = capturedAuthority(finance);
  if (!splitsAllowed(transaction))
    throw new NativeApiError(403, "AUTHORITY_CHANGED");
  const parsed = transactionSplitsSchema.parse(input);
  const dto = Object.freeze({
    lines: Object.freeze(
      parsed.lines.map((line) =>
        Object.freeze({ ...line, money: Object.freeze({ ...line.money }) }),
      ),
    ),
  });
  const { id, accountId, version } = transaction;
  return async (signal) => {
    assertActive(finance, authority, signal);
    const value = await finance.transactions.replaceSplits(
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
