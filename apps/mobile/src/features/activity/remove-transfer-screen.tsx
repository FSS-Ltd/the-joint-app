import { formatAggregateMoney } from "@joint/domain/cash-flow";
import { AppText } from "@/components/app-text";
import { NativeAction } from "@/components/native-action";
import { NativeActions } from "@/components/native-actions";
import { TransactionWriteBoundary } from "./transaction-write-boundary";
import { useTransferPair } from "./use-transfer-pair";
import { useTransferRemoveWrite } from "./use-transfer-write";

export function RemoveTransferScreen({
  transactionId,
}: {
  transactionId: string;
}): React.JSX.Element {
  const session = useTransferRemoveWrite(transactionId);
  const { draft, mutation, editable } = session;
  const base = draft.base;
  const pair = useTransferPair(base?.transfer?.id ?? null, base);
  return (
    <TransactionWriteBoundary
      session={session}
      transactionId={transactionId}
      title="Remove transfer pair"
    >
      {base && (
        <>
          <AppText>
            Removing the pair restores each entry&apos;s earlier classification.
            It never moves money.
          </AppText>
          {pair.state.kind === "ready" && (
            <>
              <AppText>
                {pair.state.value.from.description} ↔{" "}
                {pair.state.value.to.description}
              </AppText>
              <AppText tone="secondary">
                {formatAggregateMoney(pair.state.value.to.money)}
              </AppText>
            </>
          )}
          {(pair.state.kind === "idle" || pair.state.kind === "loading") && (
            <AppText accessibilityLiveRegion="polite">
              Loading the transfer pair…
            </AppText>
          )}
          {pair.state.kind === "error" && (
            <>
              <AppText accessibilityLiveRegion="polite">
                {pair.state.message}
              </AppText>
              <NativeActions>
                <NativeAction label="Retry pair" onPress={pair.reload} />
              </NativeActions>
            </>
          )}
          <NativeActions>
            <NativeAction
              label="Remove transfer pair"
              disabled={!editable || pair.state.kind !== "ready"}
              pending={mutation.kind === "pending"}
              onPress={() =>
                pair.state.kind === "ready" &&
                void session.submit({ pair: pair.state.value })
              }
            />
          </NativeActions>
        </>
      )}
    </TransactionWriteBoundary>
  );
}
