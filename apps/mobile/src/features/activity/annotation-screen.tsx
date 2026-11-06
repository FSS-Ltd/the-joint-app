import {
  classificationKindSchema,
  type ClassificationKind,
} from "@joint/contracts";
import { formatAggregateMoney } from "@joint/domain/cash-flow";
import { useRouter } from "expo-router";
import { AppText } from "@/components/app-text";
import { NativeAction } from "@/components/native-action";
import { NativeActions } from "@/components/native-actions";
import { NativeField } from "@/components/native-field";
import { Panel } from "@/components/panel";
import { Screen } from "@/components/screen";
import { AccountChoice } from "../accounts/account-choice";
import { WriteFeedback } from "../accounts/write-feedback";
import { annotationFields } from "./annotation-input";
import { useAnnotationWrite } from "./use-annotation-write";

const kindLabels: Record<ClassificationKind | "", string> = {
  "": "Not set",
  EXPENSE: "Expense",
  INCOME: "Income",
  REFUND: "Refund",
  TRANSFER: "Transfer",
  DEBT_PAYMENT: "Debt payment",
  PRINCIPAL: "Principal",
  CONTRIBUTION: "Contribution",
  UNCLASSIFIED: "Unclassified",
};
const kindOptions = ["", ...classificationKindSchema.options] as const;

export function AnnotationScreen({
  transactionId,
}: {
  transactionId: string;
}): React.JSX.Element {
  const router = useRouter();
  const session = useAnnotationWrite(transactionId);
  const { read, draft, mutation, editable } = session;
  const base = draft.base;
  const open = base ? annotationFields(base) : null;
  const detail = `/activity/${transactionId}`;
  let content: React.ReactNode;
  if (read.kind === "loading" || !draft.visible)
    content = (
      <AppText accessibilityLiveRegion="polite">Checking access…</AppText>
    );
  else if (read.kind === "error")
    content = (
      <>
        <AppText accessibilityLiveRegion="polite">{read.message}</AppText>
        <NativeActions>
          <NativeAction
            label="Retry transaction access"
            onPress={session.reload}
          />
        </NativeActions>
      </>
    );
  else if (!session.allowed || draft.invalidated)
    content = (
      <>
        <AppText>You can only view this transaction.</AppText>
        <NativeActions>
          <NativeAction
            label="Back to transaction"
            onPress={() => router.replace(detail)}
          />
        </NativeActions>
      </>
    );
  else if (!base)
    content = (
      <>
        <AppText accessibilityLiveRegion="polite">
          Your draft was cleared when the app left the foreground. Reload to
          start again.
        </AppText>
        <NativeActions>
          <NativeAction label="Reload transaction" onPress={session.reload} />
        </NativeActions>
      </>
    );
  else
    content = (
      <>
        {base && (
          <AppText tone="secondary">
            {base.description} · {formatAggregateMoney(base.money)}
          </AppText>
        )}
        {mutation.kind !== "success" && base && open && (
          <>
            {!open.classification && open.merchant && (
              <AppText>
                This transaction is paired or split, so its category and kind
                are fixed. You can still change the merchant and note.
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
        {draft.message !== "" && (
          <AppText accessibilityLiveRegion="polite">{draft.message}</AppText>
        )}
        <WriteFeedback
          mutation={mutation}
          reload={session.reload}
          outcome={{
            saved: "Saved. Open the transaction to review its latest details.",
            open: "Back to transaction",
            openHref: () => detail,
            check: "Check transaction",
            checkHref: detail,
          }}
        />
      </>
    );
  return (
    <Screen>
      <Panel>
        <AppText variant="heading" accessibilityRole="header">
          Edit classification and note
        </AppText>
        {content}
      </Panel>
    </Screen>
  );
}
