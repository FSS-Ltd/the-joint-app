import { randomUUID } from "expo-crypto";
import type { TransactionResponse } from "@joint/contracts";
import {
  transferConfirmInput,
  transferLinkAllowed,
  transferRemovable,
  transferRemoveInput,
  type TransferPair,
} from "./transfer-input";
import { transferConfirmIntent, transferRemoveIntent } from "./transfer-intent";
import {
  useTransactionWrite,
  type TransactionWriteSession,
  type TransactionWriteSpec,
} from "./use-transaction-write";

/** The matching entry is chosen in the form; its version is captured when submitted. */
export type TransferLinkDraft = { counterpart: TransactionResponse | null };
export type TransferLinkSession = TransactionWriteSession<TransferLinkDraft>;
const link: TransactionWriteSpec<TransferLinkDraft> = {
  name: "transfer",
  empty: () => ({ counterpart: null }),
  draft: () => ({ counterpart: null }),
  allowed: transferLinkAllowed,
  intent(finance, transaction, draft) {
    if (!draft.counterpart)
      return { ok: false, message: "Choose the matching entry first." };
    const input = transferConfirmInput(transaction, draft.counterpart);
    return input.ok
      ? {
          ok: true,
          value: transferConfirmIntent(
            finance,
            transaction,
            input.value,
            randomUUID(),
          ),
        }
      : input;
  },
};
export function useTransferLinkWrite(
  transactionId: string,
): TransferLinkSession {
  return useTransactionWrite(transactionId, link);
}

/** The pair is read first and submitted explicitly, so its versions are what the user saw. */
export type TransferRemoveDraft = { pair: TransferPair | null };
export type TransferRemoveSession =
  TransactionWriteSession<TransferRemoveDraft>;
const remove: TransactionWriteSpec<TransferRemoveDraft> = {
  name: "transfer-remove",
  empty: () => ({ pair: null }),
  draft: () => ({ pair: null }),
  allowed: transferRemovable,
  intent(finance, transaction, draft) {
    if (!draft.pair)
      return { ok: false, message: "Wait for the transfer pair to load." };
    const input = transferRemoveInput(transaction, draft.pair);
    return input.ok
      ? {
          ok: true,
          value: transferRemoveIntent(finance, transaction, input.value),
        }
      : input;
  },
};
export function useTransferRemoveWrite(
  transactionId: string,
): TransferRemoveSession {
  return useTransactionWrite(transactionId, remove);
}
