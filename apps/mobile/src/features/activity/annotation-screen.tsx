import { classificationKindSchema } from "@joint/contracts";
import { NativeAction } from "@/components/native-action";
import { NativeActions } from "@/components/native-actions";
import { NativeField } from "@/components/native-field";
import { AppText } from "@/components/app-text";
import { AccountChoice } from "../accounts/account-choice";
import { annotationFields } from "./annotation-input";
import { kindLabels } from "./kind-labels";
import { TransactionWriteBoundary } from "./transaction-write-boundary";
import { useAnnotationWrite } from "./use-annotation-write";

const kindOptions = ["", ...classificationKindSchema.options] as const;

export function AnnotationScreen({
  transactionId,
}: {
  transactionId: string;
}): React.JSX.Element {
  const session = useAnnotationWrite(transactionId);
  const { draft, mutation, editable } = session;
  const open = draft.base ? annotationFields(draft.base) : null;
  return (
    <TransactionWriteBoundary
      session={session}
      transactionId={transactionId}
      title="Edit classification and note"
    >
      {open && (
        <>
          {!open.classification && open.merchant && (
            <AppText>
              This transaction is paired or split, so its category and kind are
              fixed. You can still change the merchant and note.
            </AppText>
          )}
          <NativeField
            label="Category"
            value={draft.value.category}
            onChangeText={(category) =>
              draft.change({ ...draft.value, category })
            }
            autoCapitalize="sentences"
            maxLength={80}
            editable={editable && open.classification}
          />
          <AccountChoice
            label="Classification"
            value={draft.value.classificationKind}
            options={kindOptions}
            labels={kindLabels}
            onChange={(classificationKind) =>
              draft.change({ ...draft.value, classificationKind })
            }
            disabled={!editable || !open.classification}
          />
          <NativeField
            label="Merchant"
            value={draft.value.merchant}
            onChangeText={(merchant) =>
              draft.change({ ...draft.value, merchant })
            }
            autoCapitalize="words"
            maxLength={120}
            editable={editable && open.merchant}
          />
          <NativeField
            label="Your note"
            value={draft.value.note}
            onChangeText={(note) => draft.change({ ...draft.value, note })}
            autoCapitalize="sentences"
            multiline
            maxLength={2000}
            editable={editable && open.note}
          />
          <NativeActions>
            <NativeAction
              label="Save changes"
              disabled={!editable}
              pending={mutation.kind === "pending"}
              onPress={() => void session.submit()}
            />
          </NativeActions>
        </>
      )}
    </TransactionWriteBoundary>
  );
}
