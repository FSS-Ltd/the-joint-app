import { View, StyleSheet } from "react-native";
import type { BaselinesReport } from "@joint/contracts";
import { formatAggregateMoney } from "@joint/domain/cash-flow";
import { AppText } from "@/components/app-text";
import { Panel } from "@/components/panel";
import { colors, corners } from "@/theme/tokens";

export function BaselinesCard({
  report,
}: {
  report: BaselinesReport;
}): React.JSX.Element {
  if (report.insufficientHistory) {
    return (
      <Panel>
        <AppText variant="title">Spending baselines</AppText>
        <AppText tone="secondary">
          Fewer than three complete calendar months with verified coverage are
          available. Incomplete connection periods are missing history, not zero
          spending. Enter a manual contribution plan to set targets until three
          complete months are recorded.
        </AppText>
      </Panel>
    );
  }

  const baselineSpend = report.proposedBaselineSpendingMinor
    ? formatAggregateMoney({
        amountMinor: report.proposedBaselineSpendingMinor,
        currency: "GBP",
      })
    : null;

  const baselineIncome = report.proposedBaselineIncomeMinor
    ? formatAggregateMoney({
        amountMinor: report.proposedBaselineIncomeMinor,
        currency: "GBP",
      })
    : null;

  return (
    <Panel>
      <View style={styles.header}>
        <AppText variant="title">Spending baselines</AppText>
        <AppText tone="secondary">
          Derived from closed, verified calendar months. The default
          discretionary baseline uses the three-month mean; longer windows
          reveal seasonality.
        </AppText>
      </View>

      {baselineSpend && (
        <View style={styles.highlightBox}>
          <View style={styles.metricCol}>
            <AppText tone="secondary" style={styles.metricLabel}>
              3-Month Mean Spending
            </AppText>
            <AppText variant="title" style={styles.metricValue}>
              {baselineSpend}
            </AppText>
          </View>
          {baselineIncome && (
            <View style={styles.metricCol}>
              <AppText tone="secondary" style={styles.metricLabel}>
                Proposed Monthly Income
              </AppText>
              <AppText variant="title" style={styles.metricValue}>
                {baselineIncome}
              </AppText>
            </View>
          )}
        </View>
      )}

      {report.requiresIncomeConfirmation && (
        <View style={styles.noticeBox}>
          <AppText style={styles.noticeText}>
            Variable income detected across past months. Please confirm your pay
            figure before locking in savings goals.
          </AppText>
        </View>
      )}

      <View style={styles.windowsList}>
        {report.windows.map((window) => {
          if (!window.complete) return null;

          const meanSpend = formatAggregateMoney({
            amountMinor: window.meanSpendingMinor,
            currency: "GBP",
          });
          const medianSpend = formatAggregateMoney({
            amountMinor: window.medianSpendingMinor,
            currency: "GBP",
          });
          const medianInc = formatAggregateMoney({
            amountMinor: window.medianIncomeMinor,
            currency: "GBP",
          });
          const p25 = window.percentile25IncomeMinor
            ? formatAggregateMoney({
                amountMinor: window.percentile25IncomeMinor,
                currency: "GBP",
              })
            : null;

          return (
            <View key={window.windowMonths} style={styles.windowCard}>
              <View style={styles.windowHeader}>
                <AppText variant="body" style={styles.windowTitle}>
                  {`${window.windowMonths}-Month Complete Window`}
                </AppText>
                <AppText tone="secondary" style={styles.monthRange}>
                  {`${window.months[0]} to ${window.months[window.months.length - 1]}`}
                </AppText>
              </View>

              <View style={styles.windowRow}>
                <AppText tone="secondary" style={styles.statLabel}>
                  Spending (mean / median):
                </AppText>
                <AppText style={styles.statValue}>
                  {`${meanSpend} / ${medianSpend}`}
                </AppText>
              </View>

              <View style={styles.windowRow}>
                <AppText tone="secondary" style={styles.statLabel}>
                  Income (median):
                </AppText>
                <AppText style={styles.statValue}>{medianInc}</AppText>
              </View>

              {p25 && (
                <View style={styles.windowRow}>
                  <AppText tone="secondary" style={styles.statLabel}>
                    Conservative 25th percentile income:
                  </AppText>
                  <AppText style={styles.statValue}>{p25}</AppText>
                </View>
              )}
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
  highlightBox: {
    flexDirection: "row",
    backgroundColor: colors.sage,
    borderRadius: corners.surface,
    padding: 12,
    marginBottom: 12,
    gap: 16,
  },
  metricCol: {
    flex: 1,
    gap: 2,
  },
  metricLabel: {
    fontSize: 12,
  },
  metricValue: {
    fontSize: 18,
    fontWeight: "700",
    color: colors.action,
  },
  noticeBox: {
    backgroundColor: colors.ivory,
    borderRadius: corners.surface,
    padding: 10,
    marginBottom: 12,
  },
  noticeText: {
    fontSize: 13,
    color: colors.secondary,
  },
  windowsList: {
    gap: 10,
  },
  windowCard: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: corners.surface,
    padding: 10,
    gap: 4,
  },
  windowHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
  },
  windowTitle: {
    fontWeight: "600",
    color: colors.forest,
  },
  monthRange: {
    fontSize: 12,
  },
  windowRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  statLabel: {
    fontSize: 13,
  },
  statValue: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.forest,
  },
});
