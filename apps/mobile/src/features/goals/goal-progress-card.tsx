import { View, StyleSheet, Pressable } from "react-native";
import type { GoalDto } from "@joint/contracts";
import { formatAggregateMoney } from "@joint/domain/cash-flow";
import { AppText } from "@/components/app-text";
import { Panel } from "@/components/panel";
import { colors, corners, spacing } from "@/theme/tokens";

export function GoalProgressCard({
  goal,
  allocatedMinor = 0n,
  onPress,
}: {
  goal: GoalDto;
  allocatedMinor?: bigint;
  onPress?: () => void;
}): React.JSX.Element {
  const targetMinor = BigInt(goal.target.amountMinor);
  const percent =
    targetMinor > 0n
      ? Math.min(100, Number((allocatedMinor * 100n) / targetMinor))
      : 100;
  const remainingMinor =
    targetMinor > allocatedMinor ? targetMinor - allocatedMinor : 0n;

  const targetFormatted = formatAggregateMoney(goal.target);
  const allocatedFormatted = formatAggregateMoney({
    amountMinor: String(allocatedMinor),
    currency: goal.target.currency,
  });
  const remainingFormatted = formatAggregateMoney({
    amountMinor: String(remainingMinor),
    currency: goal.target.currency,
  });

  const accessibilityLabel = `${goal.name}, Target: ${targetFormatted}, Allocated: ${allocatedFormatted}, ${percent}% funded, ${remainingFormatted} remaining${goal.targetDate ? `, Target date: ${goal.targetDate}` : ""}`;

  return (
    <Panel>
      <Pressable
        onPress={onPress}
        disabled={!onPress}
        accessible
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        style={styles.container}
      >
        <View style={styles.headerRow}>
          <View style={styles.titleContainer}>
            <AppText variant="title" style={styles.title}>
              {goal.name}
            </AppText>
            <AppText tone="secondary" style={styles.subtitle}>
              {goal.beneficiary.toLowerCase()} goal · Priority {goal.priority}
            </AppText>
          </View>
          <View style={styles.badge}>
            <AppText style={styles.badgeText}>{goal.status}</AppText>
          </View>
        </View>

        <View style={styles.progressContainer}>
          <View style={styles.track}>
            <View style={[styles.fill, { width: `${percent}%` }]} />
          </View>
          <View style={styles.metricsRow}>
            <AppText variant="label" style={styles.percentText}>
              {percent}% funded
            </AppText>
            <AppText tone="secondary">
              {allocatedFormatted} of {targetFormatted}
            </AppText>
          </View>
        </View>

        <View style={styles.footerRow}>
          {goal.targetDate ? (
            <AppText tone="secondary">Target: {goal.targetDate}</AppText>
          ) : (
            <AppText tone="secondary">Ongoing savings target</AppText>
          )}
          {remainingMinor > 0n ? (
            <AppText tone="secondary">{remainingFormatted} to go</AppText>
          ) : (
            <AppText style={styles.achievedText}>Target reached</AppText>
          )}
        </View>
      </Pressable>
    </Panel>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.medium,
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  titleContainer: {
    flex: 1,
    gap: spacing.small / 2,
  },
  title: {
    fontSize: 20,
    lineHeight: 26,
    color: colors.forest,
  },
  subtitle: {
    fontSize: 14,
    textTransform: "capitalize",
  },
  badge: {
    backgroundColor: colors.sage,
    paddingHorizontal: spacing.small,
    paddingVertical: spacing.small / 2,
    borderRadius: corners.action,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.action,
  },
  progressContainer: {
    gap: spacing.small,
  },
  track: {
    height: 10,
    backgroundColor: colors.border,
    borderRadius: 5,
    overflow: "hidden",
  },
  fill: {
    height: "100%",
    backgroundColor: colors.action,
    borderRadius: 5,
  },
  metricsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  percentText: {
    color: colors.action,
    fontWeight: "700",
  },
  footerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    paddingTop: spacing.small,
  },
  achievedText: {
    color: colors.action,
    fontWeight: "600",
  },
});
