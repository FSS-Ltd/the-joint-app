import { View, StyleSheet } from "react-native";
import { formatGbpMinor } from "@joint/domain/cash-flow";
import { AppText } from "@/components/app-text";
import { Panel } from "@/components/panel";
import { colors, corners, spacing } from "@/theme/tokens";
import {
  calculateHouseholdSavingsImpact,
  type HouseholdSavingsImpact,
} from "./savings-impact";

export function SavingsImpactCard({
  scheduledSavingsMinor,
  capLines,
}: {
  scheduledSavingsMinor: string;
  capLines: readonly { limitMinor: string; actualMinor: string }[];
}): React.JSX.Element {
  const impact: HouseholdSavingsImpact = calculateHouseholdSavingsImpact(
    scheduledSavingsMinor,
    capLines,
  );

  const plannedFormatted = formatGbpMinor(BigInt(impact.scheduledSavingsMinor));
  const qualifiedFormatted = formatGbpMinor(
    BigInt(impact.qualifiedSavingsMinor),
  );
  const netOverspend = BigInt(impact.netOverspendMinor);
  const netUnderspend = BigInt(impact.netUnderspendMinor);

  return (
    <Panel>
      <View style={styles.header}>
        <AppText variant="title" style={styles.title}>
          Savings Impact
        </AppText>
        <AppText tone="secondary">
          How category budget variance affects your monthly planned savings.
        </AppText>
      </View>

      <View style={styles.statGrid}>
        <View style={styles.statBox}>
          <AppText tone="secondary" style={styles.statLabel}>
            Planned savings
          </AppText>
          <AppText variant="label" style={styles.statValue}>
            {plannedFormatted}
          </AppText>
        </View>

        <View style={styles.statBox}>
          <AppText tone="secondary" style={styles.statLabel}>
            Cap variance
          </AppText>
          <AppText
            variant="label"
            style={[
              styles.statValue,
              netOverspend > 0n
                ? styles.overspendText
                : netUnderspend > 0n
                  ? styles.underspendText
                  : undefined,
            ]}
          >
            {netOverspend > 0n
              ? `-${formatGbpMinor(netOverspend)}`
              : netUnderspend > 0n
                ? `+${formatGbpMinor(netUnderspend)}`
                : "£0.00"}
          </AppText>
        </View>

        <View style={styles.statBox}>
          <AppText tone="secondary" style={styles.statLabel}>
            Qualified savings
          </AppText>
          <AppText variant="label" style={styles.qualifiedValue}>
            {qualifiedFormatted}
          </AppText>
        </View>
      </View>

      <View style={styles.explanationBox}>
        <AppText tone="secondary" style={styles.explanationText}>
          {impact.impactExplanation}
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
  overspendText: {
    color: colors.action,
  },
  underspendText: {
    color: colors.forest,
  },
  qualifiedValue: {
    fontSize: 15,
    fontWeight: "700",
    color: colors.forest,
  },
  explanationBox: {
    marginTop: spacing.small,
    paddingTop: spacing.small,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  explanationText: {
    fontSize: 13,
    lineHeight: 18,
  },
});
