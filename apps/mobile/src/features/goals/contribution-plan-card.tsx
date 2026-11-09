import { View, StyleSheet } from "react-native";
import type { ContributionBudgetView } from "@joint/contracts";
import { formatAggregateMoney } from "@joint/domain/cash-flow";
import { AppText } from "@/components/app-text";
import { Panel } from "@/components/panel";
import { colors, corners, spacing } from "@/theme/tokens";

export function ContributionPlanCard({
  contributions,
  goalId,
}: {
  contributions: ContributionBudgetView | null;
  goalId: string;
}): React.JSX.Element {
  const planEntry = contributions?.plans.find((p) => p.plan.goalId === goalId);
  const plan = planEntry?.plan;

  if (!plan) {
    return (
      <Panel>
        <AppText variant="title" style={styles.title}>
          Monthly contributions
        </AppText>
        <AppText tone="secondary">
          No automated or scheduled monthly savings contribution has been set
          for this goal.
        </AppText>
      </Panel>
    );
  }

  const primaryMonthly = plan.monthlyContributions[0];
  const monthlyFormatted = primaryMonthly
    ? formatAggregateMoney(primaryMonthly.amount)
    : "£0.00";

  return (
    <Panel>
      <View style={styles.header}>
        <AppText variant="title" style={styles.title}>
          Contribution schedule
        </AppText>
        <AppText tone="secondary">
          Planned recurring savings into this goal.
        </AppText>
      </View>

      <View style={styles.detailBox}>
        <View style={styles.statRow}>
          <AppText tone="secondary">Scheduled contribution</AppText>
          <AppText variant="label" style={styles.statValue}>
            {monthlyFormatted} / month
          </AppText>
        </View>

        <View style={styles.statRow}>
          <AppText tone="secondary">Starts from</AppText>
          <AppText variant="label" style={styles.statValue}>
            {plan.firstContributionDate}
          </AppText>
        </View>

        {plan.monthlyContributions.length > 1 && (
          <View style={styles.stepUpsBox}>
            <AppText variant="label" style={styles.stepUpsTitle}>
              Scheduled rate changes ({plan.monthlyContributions.length} steps)
            </AppText>
            {plan.monthlyContributions.map((step, idx) => (
              <View key={idx} style={styles.stepRow}>
                <AppText tone="secondary">From month {step.fromMonth}</AppText>
                <AppText variant="body" style={styles.stepAmount}>
                  {formatAggregateMoney(step.amount)} / mo
                </AppText>
              </View>
            ))}
          </View>
        )}
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
  detailBox: {
    backgroundColor: colors.white,
    padding: spacing.medium,
    borderRadius: corners.surface,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.small,
  },
  statRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  statValue: {
    fontSize: 15,
    fontWeight: "700",
    color: colors.forest,
  },
  stepUpsBox: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    paddingTop: spacing.small,
    gap: spacing.small / 2,
  },
  stepUpsTitle: {
    fontSize: 13,
    color: colors.forest,
  },
  stepRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 2,
  },
  stepAmount: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.forest,
  },
});
