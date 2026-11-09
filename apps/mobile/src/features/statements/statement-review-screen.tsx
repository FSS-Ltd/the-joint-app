import React from "react";
import { View, ScrollView } from "react-native";
import { AppText } from "@/components/app-text";
import { NativeAction } from "@/components/native-action";
import { NativeActions } from "@/components/native-actions";
import { colors, corners, spacing } from "@/theme/tokens";
import type {
  ExtractedStatementRow,
  StatementReconciliation,
} from "./statement-converter";

const cardStyle = {
  borderWidth: 1,
  borderColor: colors.border,
  borderRadius: corners.surface,
  padding: spacing.medium,
  gap: spacing.small,
  backgroundColor: colors.white,
} as const;

const rowCardStyle = {
  borderWidth: 1,
  borderColor: colors.border,
  borderRadius: corners.surface,
  padding: spacing.medium,
  gap: spacing.small,
  marginBottom: spacing.small,
  backgroundColor: colors.white,
} as const;

const excludedRowCardStyle = {
  ...rowCardStyle,
  opacity: 0.5,
  backgroundColor: colors.ivory,
} as const;

function formatMinor(minorStr?: string): string {
  if (!minorStr) return "£0.00";
  const minor = BigInt(minorStr);
  const isNeg = minor < 0n;
  const abs = isNeg ? -minor : minor;
  const intPart = (abs / 100n).toString();
  const fracPart = (abs % 100n).toString().padStart(2, "0");
  return `${isNeg ? "-" : ""}£${intPart}.${fracPart}`;
}

export function StatementReviewScreen({
  fileName,
  pageCount,
  rows,
  reconciliation,
  onToggleExclude,
  onAcceptAndConvert,
  onCancel,
}: {
  fileName: string;
  pageCount: number;
  rows: ExtractedStatementRow[];
  reconciliation: StatementReconciliation | null;
  onToggleExclude: (id: string) => void;
  onAcceptAndConvert: () => void;
  onCancel: () => void;
}): React.JSX.Element {
  const activeCount = rows.filter((r) => !r.isExcluded).length;

  return (
    <ScrollView
      contentContainerStyle={{ padding: spacing.medium, gap: spacing.medium }}
    >
      <View style={cardStyle}>
        <AppText variant="title" accessibilityRole="header">
          Statement Review
        </AppText>
        <AppText>
          {fileName} · {pageCount} {pageCount === 1 ? "page" : "pages"} ·{" "}
          {rows.length} rows extracted ({activeCount} included).
        </AppText>
        <AppText>
          Review extracted dates and amounts. Exclude non-transaction lines
          before generating the import file.
        </AppText>
      </View>

      {reconciliation && (
        <View style={cardStyle}>
          <AppText variant="title" accessibilityRole="header">
            Summary Reconciliation
          </AppText>
          <AppText>
            Total Paid In: {formatMinor(reconciliation.calculatedCreditsMinor)}
          </AppText>
          <AppText>
            Total Paid Out: {formatMinor(reconciliation.calculatedDebitsMinor)}
          </AppText>
          {reconciliation.openingBalanceMinor && (
            <AppText>
              Opening Balance: {formatMinor(reconciliation.openingBalanceMinor)}
            </AppText>
          )}
          {reconciliation.closingBalanceMinor && (
            <AppText>
              Closing Balance: {formatMinor(reconciliation.closingBalanceMinor)}
            </AppText>
          )}
          <AppText>
            Status:{" "}
            {reconciliation.isBalanced ? "Balanced" : "Review Discrepancy"}
          </AppText>
        </View>
      )}

      <AppText variant="title" accessibilityRole="header">
        Extracted Transactions
      </AppText>

      {rows.map((row) => (
        <View
          key={row.id}
          style={row.isExcluded ? excludedRowCardStyle : rowCardStyle}
        >
          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <AppText variant="title">
              {row.date} · {formatMinor(row.amountMinor)}
            </AppText>
            <AppText>
              {row.confidence === "high" ? "Confidence: High" : "Needs Review"}
            </AppText>
          </View>

          <AppText>{row.description}</AppText>

          {row.confidenceReasons && (
            <AppText style={{ color: colors.secondary }}>
              {row.confidenceReasons.join(" ")}
            </AppText>
          )}

          <NativeActions>
            <NativeAction
              label={
                row.isExcluded ? "Include in import" : "Exclude from import"
              }
              tone={row.isExcluded ? "primary" : "secondary"}
              onPress={() => onToggleExclude(row.id)}
            />
          </NativeActions>
        </View>
      ))}

      <NativeActions>
        <NativeAction
          label="Accept and Convert to CSV"
          tone="primary"
          disabled={activeCount === 0}
          onPress={onAcceptAndConvert}
        />
        <NativeAction label="Cancel" tone="secondary" onPress={onCancel} />
      </NativeActions>
    </ScrollView>
  );
}
