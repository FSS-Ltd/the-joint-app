import {
  annotationDraft,
  annotationFields,
  annotationInput,
  type AnnotationDraft,
} from "./annotation-input";
import { annotationWriteIntent } from "./annotation-intent";
import {
  useTransactionWrite,
  type TransactionWriteSession,
  type TransactionWriteSpec,
} from "./use-transaction-write";

export type AnnotationSession = TransactionWriteSession<AnnotationDraft>;
const spec: TransactionWriteSpec<AnnotationDraft> = {
  name: "annotation",
  empty: () => ({
    category: "",
    classificationKind: "",
    merchant: "",
    note: "",
  }),
  draft: annotationDraft,
  allowed: (transaction) =>
    Object.values(annotationFields(transaction)).some(Boolean),
  intent(finance, transaction, draft) {
    const input = annotationInput(transaction, draft);
    return input.ok
      ? {
          ok: true,
          value: annotationWriteIntent(finance, transaction, input.value),
        }
      : input;
  },
};
export function useAnnotationWrite(transactionId: string): AnnotationSession {
  return useTransactionWrite(transactionId, spec);
}
