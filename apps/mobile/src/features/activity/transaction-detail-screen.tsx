import { useRouter } from "expo-router";
import type { TransactionResponse } from "@joint/contracts";
import { formatAggregateMoney } from "@joint/domain/cash-flow";
import { AppText } from "@/components/app-text";
import { NativeAction } from "@/components/native-action";
import { NativeActions } from "@/components/native-actions";
import { Panel } from "@/components/panel";
import { Screen } from "@/components/screen";
import { annotationFields } from "./annotation-input";
import { splitsAllowed } from "./split-input";
import { useTransactionRead } from "./use-transaction-read";

/** Read-only facts plus the entry to the write screens the server permits. */
export function TransactionDetailScreen({
  transactionId,
}: {
  transactionId: string;
}): React.JSX.Element {
  const router = useRouter();
  const { state, reload } = useTransactionRead(transactionId);
  return (
    <Screen>
      <Panel>
        {state.kind === "ready" ? (
          <>
            <TransactionFacts transaction={state.value} />
            {(Object.values(annotationFields(state.value)).some(Boolean) ||
              splitsAllowed(state.value)) && (
              <NativeActions>
                {Object.values(annotationFields(state.value)).some(Boolean) && (
                  <NativeAction
                    label="Edit classification and note"
                    onPress={() =>
                      router.push(`/activity/${state.value.id}/annotate`)
                    }
                  />
                )}
                {splitsAllowed(state.value) && (
                  <NativeAction
                    label={
                      state.value.splits.length > 0
                        ? "Edit split"
                        : "Split across categories"
                    }
                    tone="secondary"
                    onPress={() =>
                      router.push(`/activity/${state.value.id}/splits`)
                    }
                  />
                )}
              </NativeActions>
            )}
          </>
        ) : state.kind === "loading" ? (
          <AppText accessibilityLiveRegion="polite">
            Loading transaction…
          </AppText>
        ) : (
          <>
            <AppText accessibilityLiveRegion="polite">{state.message}</AppText>
            <NativeActions>
              <NativeAction label="Reload transaction" onPress={reload} />
            </NativeActions>
          </>
        )}
      </Panel>
    </Screen>
  );
}

function TransactionFacts({
  transaction,
}: {
  transaction: TransactionResponse;
}): React.JSX.Element {
  return (
    <>
      <AppText variant="heading" accessibilityRole="header">
        {transaction.description}
      </AppText>
      <AppText
        variant="title"
        style={{ fontVariant: ["tabular-nums"], fontSize: 30 }}
      >
        {formatAggregateMoney(transaction.money)}
      </AppText>
      <AppText tone="secondary">
        {transaction.bookedDate} · {transaction.category ?? "Uncategorised"} ·{" "}
        {transaction.classificationKind ?? "Unclassified"}
      </AppText>
      <AppText>
        {transaction.source === "CSV"
          ? "Imported from CSV"
          : "Entered manually"}
        {transaction.classificationConfirmed
          ? " · Classification confirmed"
          : ""}
      </AppText>
      {transaction.merchant && (
        <AppText>Merchant: {transaction.merchant}</AppText>
      )}
      {transaction.transfer && (
        <AppText>
          {transaction.transfer.confirmed
            ? "Confirmed transfer"
            : "Possible transfer"}
        </AppText>
      )}
      {transaction.splits.map((split) => (
        <AppText key={split.id} tone="secondary">
          {split.position + 1}. {split.category} ·{" "}
          {formatAggregateMoney(split.money)} · {split.classificationKind}
        </AppText>
      ))}
      {transaction.note.body && (
        <AppText>Note: {transaction.note.body}</AppText>
      )}
      <AppText tone="secondary">
        Version {transaction.version} ·{" "}
        {transaction.permissions.canClassify
          ? "You can classify this transaction"
          : "View only"}
      </AppText>
    </>
  );
}
