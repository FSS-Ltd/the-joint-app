import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";
import type { TransactionResponse } from "@joint/contracts";
import { formatAggregateMoney } from "@joint/domain/cash-flow";
import { AppText } from "@/components/app-text";
import { NativeAction } from "@/components/native-action";
import { NativeActions } from "@/components/native-actions";
import { Panel } from "@/components/panel";
import { Screen } from "@/components/screen";
import { useNativeFinance } from "../finance/context";
import { annotationFields } from "./annotation-input";
import { splitsAllowed } from "./split-input";
import { transferLinkAllowed, transferRemovable } from "./transfer-input";
import { useTransactionRead } from "./use-transaction-read";

/** Read-only facts plus the entry to the write screens the server permits. */
export function TransactionDetailScreen({
  transactionId,
}: {
  transactionId: string;
}): React.JSX.Element {
  const { state, reload } = useTransactionRead(transactionId);
  return (
    <Screen>
      <Panel>
        {state.kind === "ready" ? (
          <>
            <TransactionFacts transaction={state.value} />
            <TransactionActions transaction={state.value} />
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

/** Each entry appears only when the server grants the right and the row's state allows it. */
function TransactionActions({
  transaction,
}: {
  transaction: TransactionResponse;
}): React.JSX.Element | null {
  const router = useRouter();
  const { authority, spending } = useNativeFinance();
  const [ruleStatus, setRuleStatus] = useState<string | null>(null);
  const [creatingRule, setCreatingRule] = useState(false);

  const go = (path: string) => () =>
    router.push(`/activity/${transaction.id}/${path}`);
  const canAnnotate = Object.values(annotationFields(transaction)).some(
    Boolean,
  );
  const canCreateRule =
    transaction.category !== null &&
    (transaction.merchant !== null ||
      transaction.description.trim().length > 0);

  const handleCreateRule = async () => {
    if (!authority || creatingRule) return;
    const merchantPattern =
      transaction.merchant?.trim() || transaction.description.trim();
    if (!merchantPattern || !transaction.category) return;
    setCreatingRule(true);
    setRuleStatus(null);
    try {
      await spending.createRule(authority.householdId, {
        merchantPattern,
        category: transaction.category,
        priority: 100,
        enabled: true,
      });
      setRuleStatus(`Automated future categorisation for ${merchantPattern}.`);
    } catch (err: unknown) {
      const errorObj = err as { status?: number; message?: string };
      if (
        errorObj?.status === 403 ||
        errorObj?.message?.includes("CAPABILITY_UNAVAILABLE")
      ) {
        setRuleStatus("Plus plan required to automate categorisation rules.");
      } else {
        setRuleStatus("Could not create rule. Try again later.");
      }
    } finally {
      setCreatingRule(false);
    }
  };

  if (
    !canAnnotate &&
    !canCreateRule &&
    !splitsAllowed(transaction) &&
    !transferLinkAllowed(transaction) &&
    !transferRemovable(transaction)
  )
    return null;

  return (
    <View style={styles.actionsContainer}>
      <NativeActions>
        {canAnnotate && (
          <NativeAction
            label="Edit classification and note"
            onPress={go("annotate")}
          />
        )}
        {canCreateRule && (
          <NativeAction
            label="Automate rule for this merchant"
            tone="secondary"
            pending={creatingRule}
            onPress={handleCreateRule}
          />
        )}
        {splitsAllowed(transaction) && (
          <NativeAction
            label={
              transaction.splits.length > 0
                ? "Edit split"
                : "Split across categories"
            }
            tone="secondary"
            onPress={go("splits")}
          />
        )}
        {transferLinkAllowed(transaction) && (
          <NativeAction
            label="Link a transfer"
            tone="secondary"
            onPress={go("transfer")}
          />
        )}
        {transferRemovable(transaction) && (
          <NativeAction
            label="Remove transfer pair"
            tone="secondary"
            onPress={go("remove-transfer")}
          />
        )}
      </NativeActions>
      {ruleStatus && (
        <AppText
          accessibilityLiveRegion="polite"
          tone="secondary"
          style={styles.ruleStatus}
        >
          {ruleStatus}
        </AppText>
      )}
    </View>
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

const styles = StyleSheet.create({
  actionsContainer: {
    gap: 8,
  },
  ruleStatus: {
    fontSize: 13,
    paddingTop: 4,
  },
});
