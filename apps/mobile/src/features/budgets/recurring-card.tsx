import { View, StyleSheet } from "react-native";
import type { RecurringCandidateDto } from "@joint/contracts";
import { formatAggregateMoney } from "@joint/domain/cash-flow";
import { AppText } from "@/components/app-text";
import { Panel } from "@/components/panel";
import { colors, corners } from "@/theme/tokens";

export function RecurringCard({
  candidates,
}: {
  candidates: readonly RecurringCandidateDto[];
}): React.JSX.Element {
  if (candidates.length === 0) {
    return (
      <Panel>
        <AppText variant="title">Recurring commitments</AppText>
        <AppText tone="secondary">
          No regular subscriptions or bills detected in the last 180 days.
        </AppText>
      </Panel>
    );
  }

  return (
    <Panel>
      <View style={styles.header}>
        <AppText variant="title">Recurring commitments</AppText>
        <AppText tone="secondary">
          Observed expense patterns. Confirmation is required before treating
          any candidate as a committed bill.
        </AppText>
      </View>

      <View style={styles.list}>
        {candidates.map((candidate) => {
          const formattedAmount = formatAggregateMoney({
            amountMinor: candidate.medianAmountMinor,
            currency: "GBP",
          });
          const cadencePeriod =
            candidate.cadence === "WEEKLY" ? "week" : "month";

          return (
            <View
              key={candidate.id}
              style={styles.candidateRow}
              accessible
              accessibilityLabel={`${candidate.normalisedMerchant}, ${formattedAmount} per ${cadencePeriod}, ${candidate.cadence.toLowerCase()} cadence`}
            >
              <View style={styles.candidateInfo}>
                <View style={styles.titleRow}>
                  <AppText variant="body" style={styles.merchantName}>
                    {candidate.normalisedMerchant}
                  </AppText>
                  <View style={styles.badgeRow}>
                    <View style={styles.cadenceBadge}>
                      <AppText style={styles.badgeText}>
                        {candidate.cadence}
                      </AppText>
                    </View>
                    {candidate.isVariable && (
                      <View style={styles.variableBadge}>
                        <AppText style={styles.variableText}>
                          Variable bill
                        </AppText>
                      </View>
                    )}
                  </View>
                </View>

                <View style={styles.metaRow}>
                  <AppText tone="secondary" style={styles.occurrenceText}>
                    {`${candidate.occurrenceCount} occurrences · ${candidate.confidence.toLowerCase()} confidence`}
                  </AppText>
                  {candidate.category && (
                    <AppText tone="secondary" style={styles.categoryText}>
                      {candidate.category}
                    </AppText>
                  )}
                </View>
              </View>

              <View style={styles.amountCol}>
                <AppText variant="body" style={styles.amountText}>
                  {formattedAmount}
                </AppText>
                <AppText tone="secondary" style={styles.perPeriodText}>
                  {`/${cadencePeriod}`}
                </AppText>
              </View>
            </View>
          );
        })}
      </View>
    </Panel>
  );
}

const styles = StyleSheet.create({
  header: {
    gap: 4,
    marginBottom: 12,
  },
  list: {
    gap: 12,
  },
  candidateRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  candidateInfo: {
    flex: 1,
    gap: 4,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 6,
  },
  merchantName: {
    fontWeight: "600",
    textTransform: "capitalize",
    color: colors.forest,
  },
  badgeRow: {
    flexDirection: "row",
    gap: 4,
  },
  cadenceBadge: {
    backgroundColor: colors.sage,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: corners.surface,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: "600",
    color: colors.action,
  },
  variableBadge: {
    backgroundColor: colors.sage,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: corners.surface,
  },
  variableText: {
    fontSize: 11,
    color: colors.secondary,
  },
  metaRow: {
    flexDirection: "row",
    gap: 8,
  },
  occurrenceText: {
    fontSize: 12,
  },
  categoryText: {
    fontSize: 12,
  },
  amountCol: {
    alignItems: "flex-end",
    marginLeft: 12,
  },
  amountText: {
    fontWeight: "700",
    color: colors.forest,
  },
  perPeriodText: {
    fontSize: 11,
  },
});
