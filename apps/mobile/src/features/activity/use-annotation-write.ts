import { useLayoutEffect } from "react";
import type { TransactionResponse } from "@joint/contracts";
import { useNativeFinance } from "../finance/context";
import { financeErrorMessage } from "../finance/errors";
import { useFinanceMutation } from "../finance/use-mutation";
import { useWriteDraft } from "../accounts/use-write-draft";
import type { WriteDraft } from "../accounts/write-state";
import type { FinanceMutationResult } from "../finance/state";
import {
  annotationDraft,
  annotationFields,
  annotationInput,
  type AnnotationDraft,
} from "./annotation-input";
import { annotationWriteIntent } from "./annotation-intent";
import {
  useTransactionRead,
  type TransactionReadState,
} from "./use-transaction-read";

const empty = (): AnnotationDraft => ({
  category: "",
  classificationKind: "",
  merchant: "",
  note: "",
});
export interface AnnotationSession {
  read: TransactionReadState;
  draft: WriteDraft<AnnotationDraft, TransactionResponse>;
  mutation: FinanceMutationResult<TransactionResponse>;
  allowed: boolean;
  editable: boolean;
  reload(): void;
  submit(): Promise<void>;
}
/**
 * The draft is bound to the row version it was loaded from. A newer server version
 * is refused by If-Match and recovered through an explicit reload, never replaced silently.
 */
export function useAnnotationWrite(transactionId: string): AnnotationSession {
  const finance = useNativeFinance();
  const { state: read, reload: reread } = useTransactionRead(transactionId);
  const draft = useWriteDraft<AnnotationDraft, TransactionResponse>(
    `annotation:${transactionId}`,
    empty,
  );
  const mutation = useFinanceMutation<TransactionResponse>(
    `annotation:${transactionId}`,
  );
  const transaction = read.kind === "ready" ? read.value : null;
  const allowed =
    transaction !== null &&
    Object.values(annotationFields(transaction)).some(Boolean);
  useLayoutEffect(() => {
    if (!transaction) return;
    if (!allowed) {
      draft.invalidate();
      mutation.reset();
    } else draft.initialize(transaction, annotationDraft(transaction));
  }, [
    transaction,
    allowed,
    draft.base,
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
  async function submit(): Promise<void> {
    if (!editable || !draft.base) return;
    const input = annotationInput(draft.base, draft.value);
    if (!input.ok) {
      draft.error(input.message);
      return;
    }
    try {
      await mutation.submit(
        annotationWriteIntent(finance, draft.base, input.value),
      );
    } catch (error) {
      draft.error(financeErrorMessage(error));
    }
  }
  return { read, draft, mutation, allowed, editable, reload, submit };
}
