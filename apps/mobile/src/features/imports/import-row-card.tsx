import { View } from "react-native";
import type { NormalizedCsvRow } from "@joint/contracts";
import { formatAggregateMoney } from "@joint/domain/cash-flow";
import { AppText } from "@/components/app-text";
import { AccountChoice } from "../accounts/account-choice";
import { colors, corners, spacing } from "@/theme/tokens";
import { rejectLabels } from "./reject-labels";

const group = {
  borderWidth: 1,
  borderColor: colors.border,
  borderRadius: corners.surface,
  padding: spacing.medium,
  gap: spacing.small,
} as const;

const decisions = {
  "": "Choose Keep or Skip",
  KEEP: "Keep",
  SKIP: "Skip",
} as const;

/** One source row: what it is, why it needs a decision, and the choice. */
export function ImportRowCard({
  row,
  editable,
  choice,
  onChoose,
}: {
  row: NormalizedCsvRow;
  editable: boolean;
  choice: "KEEP" | "SKIP" | undefined;
  onChoose(decision: "KEEP" | "SKIP"): void;
}): React.JSX.Element {
  if (row.status === "REJECTED")
    return (
      <View style={group}>
        <AppText variant="title" accessibilityRole="header">
          {`Row ${row.rowNumber}: rejected`}
        </AppText>
        <AppText>{rejectLabels[row.reason]}</AppText>
      </View>
    );
  const current = choice ?? (row.decision === "REVIEW" ? "" : row.decision);
  return (
    <View style={group}>
      <AppText variant="title" accessibilityRole="header">
        {`Row ${row.rowNumber}`}
      </AppText>
      <AppText>
        {row.description} · {row.bookedDate} · {formatAggregateMoney(row.money)}
      </AppText>
      {row.sourceId && (
        <AppText tone="secondary">Source ID: {row.sourceId}</AppText>
      )}
      {row.duplicate ? (
        <AppText>
          Same source ID and content are already recorded. This row is skipped.
        </AppText>
      ) : (
        <>
          {row.overlaps.map((overlap) => (
            <AppText key={overlap.transactionId} tone="secondary">
              Possible overlap with {overlap.bookedDate} · {overlap.description}{" "}
              · {formatAggregateMoney(overlap.money)}
            </AppText>
          ))}
          {editable && (
            <AccountChoice
              label={`Decision for row ${row.rowNumber}`}
              value={current}
              // The prompt is only offered while the row is undecided.
              options={
                current === ""
                  ? (["", "KEEP", "SKIP"] as const)
                  : (["KEEP", "SKIP"] as const)
              }
              labels={decisions}
              onChange={(next) => {
                if (next !== "") onChoose(next);
              }}
              disabled={false}
            />
          )}
        </>
      )}
    </View>
  );
}
