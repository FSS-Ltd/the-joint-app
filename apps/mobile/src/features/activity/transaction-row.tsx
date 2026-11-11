import type { TransactionResponse } from "@joint/contracts";
import { formatAggregateMoney } from "@joint/domain/cash-flow";
import { Pressable, StyleSheet, useWindowDimensions, View } from "react-native";
import { AppText } from "@/components/app-text";
import { colors, corners, spacing } from "@/theme/tokens";

/** Render only server projections; amounts stay exact integer strings. */
export function TransactionRow({
  transaction,
  onOpen,
}: {
  transaction: TransactionResponse;
  onOpen(transactionId: string): void;
}): React.JSX.Element {
  const { width, fontScale } = useWindowDimensions();
  const stacked = width < 360 || fontScale >= 1.3;
  const details = [
    transaction.bookedDate,
    transaction.category ?? "Uncategorised",
    transaction.classificationKind ?? "Unclassified",
  ].join(" · ");
  const metadata = [
    transaction.source === "CSV" ? "Imported" : "Entered manually",
    transaction.splits.length > 0
      ? `${transaction.splits.length} split lines`
      : null,
    transaction.transfer
      ? transaction.transfer.confirmed
        ? "Confirmed transfer"
        : "Possible transfer"
      : null,
    transaction.note.body ? "Note" : null,
  ]
    .filter(Boolean)
    .join(" · ");
  const amount = formatAggregateMoney(transaction.money);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Open ${transaction.description}. ${amount}. ${details}. ${metadata}`}
      onPress={() => onOpen(transaction.id)}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      <View style={[styles.content, stacked && styles.stacked]}>
        <View style={styles.description}>
          <AppText variant="label" style={styles.title}>
            {transaction.description}
          </AppText>
          <AppText tone="secondary">{details}</AppText>
          <AppText tone="secondary">{metadata}</AppText>
        </View>
        <AppText variant="label" style={styles.amount}>
          {amount}
        </AppText>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    backgroundColor: colors.ivory,
    borderRadius: corners.surface,
    padding: spacing.medium,
    minHeight: 48,
  },
  pressed: { opacity: 0.75 },
  content: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.small,
  },
  stacked: { flexDirection: "column" },
  description: { flex: 1, gap: spacing.small / 2 },
  title: { fontSize: 18, lineHeight: 24 },
  amount: { fontVariant: ["tabular-nums"], fontSize: 18, lineHeight: 24 },
});
