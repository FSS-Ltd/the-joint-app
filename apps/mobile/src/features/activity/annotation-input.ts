import {
  transactionAnnotationSchema,
  type ClassificationKind,
  type TransactionResponse,
} from "@joint/contracts";
import type { InputResult } from "../accounts/write-input";

export type AnnotationInput = ReturnType<
  typeof transactionAnnotationSchema.parse
>;
/** Empty text means "no value"; the server owns every classification rule. */
export type AnnotationDraft = {
  category: string;
  classificationKind: ClassificationKind | "";
  merchant: string;
  note: string;
};

/** Paired and split rows keep their server-set classification; only merchant and note stay open. */
export function annotationFields(transaction: TransactionResponse): {
  classification: boolean;
  merchant: boolean;
  note: boolean;
} {
  const locked =
    transaction.transfer?.confirmed === true || transaction.splits.length > 0;
  return {
    classification: transaction.permissions.canClassify && !locked,
    merchant: transaction.permissions.canClassify,
    note: transaction.permissions.canNote,
  };
}
export function annotationDraft(
  transaction: TransactionResponse,
): AnnotationDraft {
  return {
    category: transaction.category ?? "",
    classificationKind: transaction.classificationKind ?? "",
    merchant: transaction.merchant ?? "",
    note: transaction.note.body ?? "",
  };
}
const invalid =
  "Check the text lengths: category 80, merchant 120 and note 2,000 characters. Change at least one field.";
/** Only changed, permitted fields are sent; clearing a field sends null. */
export function annotationInput(
  transaction: TransactionResponse,
  draft: AnnotationDraft,
): InputResult<AnnotationInput> {
  const open = annotationFields(transaction);
  const before = annotationDraft(transaction);
  const next = {
    category: draft.category.trim(),
    classificationKind: draft.classificationKind,
    merchant: draft.merchant.trim(),
    note: draft.note.trim(),
  };
  const changed = {
    category: next.category !== before.category,
    classificationKind: next.classificationKind !== before.classificationKind,
    merchant: next.merchant !== before.merchant,
    note: next.note !== before.note,
  };
  if (
    ((changed.category || changed.classificationKind) &&
      !open.classification) ||
    (changed.merchant && !open.merchant) ||
    (changed.note && !open.note)
  )
    return {
      ok: false,
      message: "This transaction cannot be changed that way.",
    };
  const parsed = transactionAnnotationSchema.safeParse({
    ...(changed.category ? { category: next.category || null } : {}),
    ...(changed.classificationKind
      ? { classificationKind: next.classificationKind || null }
      : {}),
    ...(changed.merchant ? { merchant: next.merchant || null } : {}),
    ...(changed.note
      ? { note: next.note || null, noteVersion: transaction.note.version }
      : {}),
  });
  return parsed.success
    ? { ok: true, value: parsed.data }
    : { ok: false, message: invalid };
}
