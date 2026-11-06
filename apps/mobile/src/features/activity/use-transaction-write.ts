import { useLayoutEffect } from "react";
import type { TransactionResponse } from "@joint/contracts";
import { useNativeFinance } from "../finance/context";
import type { NativeFinanceContextValue } from "../finance/context";
import { financeErrorMessage } from "../finance/errors";
import { useFinanceMutation } from "../finance/use-mutation";
import { useWriteDraft } from "../accounts/use-write-draft";
import type { WriteDraft } from "../accounts/write-state";
import type { InputResult } from "../accounts/write-input";
import type { FinanceMutationResult } from "../finance/state";
import {
  useTransactionRead,
  type TransactionReadState,
} from "./use-transaction-read";

/** Declares one kind of transaction write; must be a stable module-level constant. */
export interface TransactionWriteSpec<D> {
  name: string;
  empty(): D;
  draft(transaction: TransactionResponse): D;
  allowed(transaction: TransactionResponse): boolean;
  intent(
    finance: NativeFinanceContextValue,
    transaction: TransactionResponse,
    draft: D,
  ): InputResult<(signal: AbortSignal) => Promise<TransactionResponse>>;
}
export interface TransactionWriteSession<D> {
  read: TransactionReadState;
  draft: WriteDraft<D, TransactionResponse>;
  mutation: FinanceMutationResult<TransactionResponse>;
  allowed: boolean;
  editable: boolean;
  reload(): void;
  /** An explicit draft (such as "clear split") replaces the edited one for this call only. */
  submit(override?: D): Promise<void>;
}
/**
 * The draft is bound to the row version it was loaded from. A newer server version
 * is refused by If-Match and recovered through an explicit reload, never replaced silently.
 */
export function useTransactionWrite<D>(
  transactionId: string,
  spec: TransactionWriteSpec<D>,
): TransactionWriteSession<D> {
  const finance = useNativeFinance();
  const { state: read, reload: reread } = useTransactionRead(transactionId);
  const key = `${spec.name}:${transactionId}`;
  const draft = useWriteDraft<D, TransactionResponse>(key, spec.empty);
  const mutation = useFinanceMutation<TransactionResponse>(key);
  const transaction = read.kind === "ready" ? read.value : null;
  const allowed = transaction !== null && spec.allowed(transaction);
  useLayoutEffect(() => {
    if (!transaction) return;
    if (!allowed) {
      draft.invalidate();
      mutation.reset();
    } else draft.initialize(transaction, spec.draft(transaction));
  }, [
    transaction,
    allowed,
    spec,
    draft.initialize,
    draft.invalidate,
    mutation.reset,
  ]);
  const editable =
    draft.visible &&
    !draft.invalidated &&
    allowed &&
    draft.base !== null &&
    mutation.kind === "idle";
  function reload() {
    mutation.reset();
    draft.clear();
    reread();
  }
  async function submit(override?: D): Promise<void> {
    if (!editable || !draft.base) return;
    try {
      const built = spec.intent(finance, draft.base, override ?? draft.value);
      if (!built.ok) {
        draft.error(built.message);
        return;
      }
      await mutation.submit(built.value);
    } catch (error) {
      draft.error(financeErrorMessage(error));
    }
  }
  return { read, draft, mutation, allowed, editable, reload, submit };
}
