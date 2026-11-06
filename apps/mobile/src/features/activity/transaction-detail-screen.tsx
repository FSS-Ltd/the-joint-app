import { useEffect, useState } from "react";
import type { TransactionResponse } from "@joint/contracts";
import { formatAggregateMoney } from "@joint/domain/cash-flow";
import { AppText } from "@/components/app-text";
import { NativeAction } from "@/components/native-action";
import { NativeActions } from "@/components/native-actions";
import { Panel } from "@/components/panel";
import { Screen } from "@/components/screen";
import { useNativeFinance } from "../finance/context";
import { financeErrorMessage } from "../finance/errors";

type DetailState =
  | { kind: "loading" }
  | { kind: "ready"; value: TransactionResponse }
  | { kind: "error"; message: string };

/** One fenced read per authority; no polling and no implicit retry. */
export function TransactionDetailScreen({
  transactionId,
}: {
  transactionId: string;
}): React.JSX.Element {
  const finance = useNativeFinance();
  const authority = finance.authority;
  const [state, setState] = useState<DetailState>({ kind: "loading" });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!authority) return;
    const controller = new AbortController();
    setState({ kind: "loading" });
    void finance.transactions
      .read(authority.householdId, transactionId, controller.signal)
      .then((value) => {
        if (!controller.signal.aborted) setState({ kind: "ready", value });
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted)
          setState({ kind: "error", message: financeErrorMessage(error) });
      });
    return () => controller.abort();
  }, [authority, finance, transactionId, attempt]);
  return (
    <Screen>
      <Panel>
        {state.kind === "ready" ? (
          <TransactionFacts transaction={state.value} />
        ) : state.kind === "loading" ? (
          <AppText accessibilityLiveRegion="polite">
            Loading transaction…
          </AppText>
        ) : (
          <>
            <AppText accessibilityLiveRegion="polite">{state.message}</AppText>
            <NativeActions>
              <NativeAction
                label="Reload transaction"
                onPress={() => setAttempt((value) => value + 1)}
              />
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
