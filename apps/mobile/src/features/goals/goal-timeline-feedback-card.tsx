import { View, StyleSheet } from "react-native";
import { formatGbpMinor } from "@joint/domain/cash-flow";
import { AppText } from "@/components/app-text";
import { Panel } from "@/components/panel";
import { colors, corners, spacing } from "@/theme/tokens";
import {
  evaluateGoalTimelineFeedback,
  type GoalTimelineInputs,
} from "./goal-timeline-feedback";

export function GoalTimelineFeedbackCard({
  inputs,
}: {
  inputs: GoalTimelineInputs;
}): React.JSX.Element {
  const feedback = evaluateGoalTimelineFeedback(inputs);

  const currentFormatted = formatGbpMinor(
    BigInt(feedback.currentAmountMinor || "0"),
  );
  const targetFormatted = formatGbpMinor(
    BigInt(feedback.targetAmountMinor || "0"),
  );
  const remainingFormatted = formatGbpMinor(
    BigInt(feedback.remainingAmountMinor || "0"),
  );

  return (
    <Panel>
      <View style={styles.header}>
        <AppText variant="title" style={styles.title}>
          {feedback.mode === "amount-only"
            ? "Amount-only goal status"
            : "Goal timeline progress"}
        </AppText>
        <AppText tone="secondary">
          {feedback.mode === "amount-only"
            ? "Timeline estimation requires confirmed target, opening balance, and recurring contributions."
            : "Deterministic timeline projection is active for this goal."}
        </AppText>
      </View>

      <View style={styles.statGrid}>
        <View style={styles.statBox}>
          <AppText tone="secondary" style={styles.statLabel}>
            Allocated
          </AppText>
          <AppText variant="label" style={styles.statValue}>
            {currentFormatted}
          </AppText>
        </View>

        <View style={styles.statBox}>
          <AppText tone="secondary" style={styles.statLabel}>
            Target
          </AppText>
          <AppText variant="label" style={styles.statValue}>
            {targetFormatted}
          </AppText>
        </View>

        <View style={styles.statBox}>
          <AppText tone="secondary" style={styles.statLabel}>
            Remaining
          </AppText>
          <AppText variant="label" style={styles.remainingValue}>
            {remainingFormatted}
          </AppText>
        </View>
      </View>

      <View style={styles.reasonBox}>
        <AppText tone="secondary" style={styles.reasonText}>
          {feedback.reason}
        </AppText>
      </View>
    </Panel>
  );
}

const styles = StyleSheet.create({
  header: {
    gap: spacing.small / 2,
  },
  title: {
    fontSize: 18,
    lineHeight: 24,
    color: colors.forest,
  },
  statGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.small,
    marginTop: spacing.small,
  },
  statBox: {
    flex: 1,
    minWidth: "28%",
    backgroundColor: colors.white,
    padding: spacing.small,
    borderRadius: corners.surface,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 2,
  },
  statLabel: {
    fontSize: 12,
  },
  statValue: {
    fontSize: 15,
    fontWeight: "700",
    color: colors.forest,
  },
  remainingValue: {
    fontSize: 15,
    fontWeight: "700",
    color: colors.action,
  },
  reasonBox: {
    marginTop: spacing.small,
    paddingTop: spacing.small,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  reasonText: {
    fontSize: 13,
    lineHeight: 18,
  },
});
