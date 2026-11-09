import { View, StyleSheet } from "react-native";
import type { ProjectionRunDto, ProjectionResultV1 } from "@joint/contracts";
import { formatAggregateMoney } from "@joint/domain/cash-flow";
import { AppText } from "@/components/app-text";
import { Panel } from "@/components/panel";
import { colors, corners, spacing } from "@/theme/tokens";

function statusExplanation(
  status: ProjectionResultV1["status"],
  firstQualifyingDate: string | null,
): {
  title: string;
  explanation: string;
  tone: "primary" | "secondary" | "action";
} {
  switch (status) {
    case "already_achieved":
      return {
        title: "Target already achieved",
        explanation:
          "Allocated funding already meets or exceeds the goal target.",
        tone: "action",
      };
    case "reachable":
      return {
        title: firstQualifyingDate
          ? `On track · ${firstQualifyingDate}`
          : "On track to reach target",
        explanation: firstQualifyingDate
          ? `Projected to reach target by ${firstQualifyingDate} under scheduled contributions.`
          : "Projected to reach target within the modelled horizon.",
        tone: "action",
      };
    case "beyond_horizon":
      return {
        title: "Reachable beyond horizon",
        explanation:
          "Steady progress is projected, but the target requires a longer timeline than modelled.",
        tone: "secondary",
      };
    case "depleted":
      return {
        title: "Depletion projected",
        explanation:
          "Planned outflows or fees exceed funding before the horizon ends.",
        tone: "secondary",
      };
    case "budget_deficit":
      return {
        title: "Contribution deficit",
        explanation:
          "Monthly scheduled contributions are insufficient to offset planned withdrawals.",
        tone: "secondary",
      };
    case "insufficient_inputs":
      return {
        title: "Insufficient inputs",
        explanation: "Additional opening balances or contributions required.",
        tone: "secondary",
      };
    case "unreachable_under_assumptions":
    default:
      return {
        title: "Adjustment required",
        explanation:
          "Goal is unreachable under current contribution rates and assumptions.",
        tone: "secondary",
      };
  }
}

export function ProjectionBreakdownCard({
  run,
}: {
  run: ProjectionRunDto;
}): React.JSX.Element {
  const result = run.result;
  const statusInfo = statusExplanation(
    result.status,
    result.firstQualifyingDate,
  );
  const targetFormatted = formatAggregateMoney(run.input.target);
  const openingFormatted = formatAggregateMoney(run.input.opening);
  const closingFormatted = formatAggregateMoney(result.breakdown.closing);
  const totalContributedFormatted = formatAggregateMoney(
    result.breakdown.contributions,
  );
  const totalGrowthFormatted = formatAggregateMoney(result.breakdown.growth);

  const totalFeesMinor =
    BigInt(result.breakdown.proportionalFees.amountMinor) +
    BigInt(result.breakdown.fixedFees.amountMinor);
  const totalFeesFormatted = formatAggregateMoney({
    amountMinor: String(totalFeesMinor),
    currency: result.breakdown.closing.currency,
  });

  const series = result.series;
  // Select milestone samples (e.g. Month 6, 12, 18, 24)
  const milestoneIndices = [6, 12, 18, 24, 36, 48, 60].filter(
    (idx) => idx <= series.length,
  );
  if (milestoneIndices.length === 0 && series.length > 0) {
    milestoneIndices.push(series.length);
  } else if (
    milestoneIndices[milestoneIndices.length - 1] !== series.length &&
    series.length > 0
  ) {
    milestoneIndices.push(series.length);
  }

  const milestones = milestoneIndices.map((idx) => {
    const entry = series[idx - 1];
    return {
      month: idx,
      date: entry?.date ?? "",
      balanceFormatted: entry ? formatAggregateMoney(entry.closing) : "",
    };
  });

  return (
    <Panel>
      <View style={styles.header}>
        <View style={styles.modeBadge}>
          <AppText style={styles.modeBadgeText}>
            {run.mode === "ADVANCED" ? "Advanced Scenario" : "Basic Projection"}
          </AppText>
        </View>
        <AppText variant="title" style={styles.statusTitle}>
          {statusInfo.title}
        </AppText>
        <AppText tone="secondary">{statusInfo.explanation}</AppText>
      </View>

      <View style={styles.statGrid}>
        <View style={styles.statBox}>
          <AppText tone="secondary" style={styles.statLabel}>
            Opening
          </AppText>
          <AppText variant="label" style={styles.statValue}>
            {openingFormatted}
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
            Projected end
          </AppText>
          <AppText variant="label" style={styles.statValue}>
            {closingFormatted}
          </AppText>
        </View>
        <View style={styles.statBox}>
          <AppText tone="secondary" style={styles.statLabel}>
            Contributions
          </AppText>
          <AppText variant="label" style={styles.statValue}>
            {totalContributedFormatted}
          </AppText>
        </View>
      </View>

      {run.mode === "ADVANCED" && (
        <View style={styles.breakdownRow}>
          <AppText tone="secondary">
            Projected growth: {totalGrowthFormatted} · Fees drag:{" "}
            {totalFeesFormatted}
          </AppText>
        </View>
      )}

      {milestones.length > 0 && (
        <View style={styles.milestoneSection}>
          <AppText variant="label" style={styles.milestoneHeading}>
            Milestones trajectory
          </AppText>
          <View style={styles.milestoneTable}>
            {milestones.map((m) => (
              <View key={m.month} style={styles.milestoneRow} accessible>
                <AppText tone="secondary" style={styles.milestoneMonth}>
                  Month {m.month} ({m.date})
                </AppText>
                <AppText variant="body" style={styles.milestoneBalance}>
                  {m.balanceFormatted}
                </AppText>
              </View>
            ))}
          </View>
        </View>
      )}

      {result.warnings.length > 0 && (
        <View style={styles.warningsContainer}>
          {result.warnings.map((w, index) => {
            let label: string = w;
            if (w === "PARTIAL_SOURCE") {
              label =
                "Limited source access: Some account valuations could not be verified.";
            } else if (w === "STALE_VALUATION") {
              label = "Stale valuation: Newer account balances are available.";
            } else if (w === "UNMODELLED_FEES") {
              label = "Fees unmodelled: Basic mode assumes zero fee friction.";
            } else if (w === "UNMODELLED_TAX") {
              label =
                "Tax drag unmodelled: Basic mode does not deduct capital taxes.";
            }
            return (
              <AppText key={index} tone="secondary" style={styles.warningText}>
                Notice: {label}
              </AppText>
            );
          })}
        </View>
      )}
    </Panel>
  );
}

const styles = StyleSheet.create({
  header: {
    gap: spacing.small / 2,
  },
  modeBadge: {
    alignSelf: "flex-start",
    backgroundColor: colors.sage,
    paddingHorizontal: spacing.small,
    paddingVertical: 2,
    borderRadius: corners.action,
    marginBottom: spacing.small / 2,
  },
  modeBadgeText: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.action,
  },
  statusTitle: {
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
    minWidth: "45%",
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
  breakdownRow: {
    paddingTop: spacing.small,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  milestoneSection: {
    gap: spacing.small / 2,
    marginTop: spacing.small,
  },
  milestoneHeading: {
    fontSize: 13,
    color: colors.forest,
  },
  milestoneTable: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: corners.surface,
    overflow: "hidden",
  },
  milestoneRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: spacing.medium,
    paddingVertical: spacing.small,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  milestoneMonth: {
    fontSize: 13,
  },
  milestoneBalance: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.forest,
  },
  warningsContainer: {
    marginTop: spacing.small,
    gap: spacing.small / 2,
    paddingTop: spacing.small,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  warningText: {
    fontSize: 12,
    color: colors.action,
  },
});
