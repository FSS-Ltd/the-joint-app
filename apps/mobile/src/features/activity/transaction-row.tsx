import type { TransactionResponse } from "@joint/contracts";
import { formatAggregateMoney } from "@joint/domain/cash-flow";
import { AppText } from "@/components/app-text";
import { NativeAction } from "@/components/native-action";
import { NativeActions } from "@/components/native-actions";
import { Panel } from "@/components/panel";

/** Render only server projections; amounts stay exact integer strings. */
export function TransactionRow({
  transaction,
  onOpen,
}: {
  transaction: TransactionResponse;
  onOpen(transactionId: string): void;
}): React.JSX.Element {
  const details = [
    transaction.bookedDate,
    transaction.category ?? "Uncategorised",
    transaction.classificationKind ?? "Unclassified",
  ].join(" · ");
  return (
    <Panel>
      <AppText variant="title">{transaction.description}</AppText>
      <AppText
        variant="heading"
        style={{ fontVariant: ["tabular-nums"], fontSize: 26 }}
      >
        {formatAggregateMoney(transaction.money)}
      </AppText>
      <AppText tone="secondary">{details}</AppText>
      <AppText tone="secondary">
        {transaction.source === "CSV" ? "Imported" : "Entered manually"}
        {transaction.splits.length > 0
          ? ` · ${transaction.splits.length} split lines`
          : ""}
        {transaction.transfer
          ? transaction.transfer.confirmed
            ? " · Confirmed transfer"
            : " · Possible transfer"
          : ""}
        {transaction.note.body ? " · Note" : ""}
      </AppText>
      <NativeActions>
        <NativeAction
          label={`Open ${transaction.description}`}
          tone="text"
          onPress={() => onOpen(transaction.id)}
        />
      </NativeActions>
    </Panel>
  );
}
