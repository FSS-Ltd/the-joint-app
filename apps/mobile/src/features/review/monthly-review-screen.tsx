import { useState } from "react";
import { View, StyleSheet } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { monthSchema, type SpendingReport } from "@joint/contracts";
import { chartRatio, formatAggregateMoney } from "@joint/domain/cash-flow";
import { Screen } from "@/components/screen";
import { AppText } from "@/components/app-text";
import { NativeAction } from "@/components/native-action";
import { NativeActions } from "@/components/native-actions";
import { Panel } from "@/components/panel";
import { colors, spacing, corners } from "@/theme/tokens";
import { useNativeFinance } from "../finance/context";
import { financeAuthorityKey } from "../finance/scope";
import { CoverageCard } from "./coverage-card";
import { MonthEndSurplusCard } from "./month-end-surplus-card";
import { sortedCategoriesBySpend } from "./review-helpers";
import { categoryActual } from "../budgets/cap-math";
import { SavingsImpactCard } from "../budgets/savings-impact-card";
import { useGoalsData } from "../goals/use-goals-data";
import {
  currentMobileMonth,
  previousMonth,
  nextMonth,
} from "../budgets/month-helpers";
import { MonthSelector } from "../budgets/month-selector";
import { useSpendingReport } from "../budgets/use-spending-report";

export function CashFlowSummary({
  report,
}: {
  report: SpendingReport;
}): React.JSX.Element | null {
  const summary = report.summary;
  if (!summary) return null;

  return (
    <Panel>
      <View style={styles.heroHeader}>
        <AppText variant="label" tone="secondary">
          Spending · {report.month}
        </AppText>
        <AppText
          variant="label"
          tone={report.coverage.complete ? "primary" : "secondary"}
          style={
            report.coverage.complete
              ? styles.completeBadge
              : styles.incompleteBadge
          }
        >
          {report.coverage.complete ? "Reviewed period" : "Incomplete picture"}
        </AppText>
      </View>

      <AppText variant="heading">
        {formatAggregateMoney(summary.spending)}
      </AppText>
      <AppText tone="secondary">
        Purchases less refunds booked in this month.
      </AppText>

      <View style={styles.statGrid}>
        <View style={styles.statBox}>
          <AppText variant="label" tone="secondary">
            Confirmed income
          </AppText>
          <AppText variant="title">
            {formatAggregateMoney(summary.income)}
          </AppText>
        </View>
        <View style={styles.statBox}>
          <AppText variant="label" tone="secondary">
            Net cash movement
          </AppText>
          <AppText variant="title">
            {formatAggregateMoney(summary.netCash)}
          </AppText>
        </View>
      </View>
    </Panel>
  );
}

export function CategoryBreakdownSection({
  report,
}: {
  report: SpendingReport;
}): React.JSX.Element {
  const categories = sortedCategoriesBySpend(report);
  const maxSpend = categories.reduce((max, cat) => {
    const val = BigInt(cat.spending.amountMinor);
    const abs = val < 0n ? -val : val;
    return abs > max ? abs : max;
  }, 1n);

  return (
    <Panel>
      <AppText variant="title">By category</AppText>
      {categories.length === 0 ? (
        <AppText tone="secondary">No spending records in this period.</AppText>
      ) : (
        <View style={styles.categoryList}>
          {categories.map((c) => {
            const name = c.grouped
              ? "Other categories (grouped)"
              : (c.category ?? "Uncategorized");
            const val = BigInt(c.spending.amountMinor);
            const abs = val < 0n ? -val : val;
            const barWidth = chartRatio(
              abs.toString(),
              maxSpend.toString(),
              100,
            );
            const isRefund = val < 0n;

            return (
              <View
                key={JSON.stringify([c.category, c.grouped])}
                style={styles.categoryRow}
              >
                <View style={styles.categoryHeader}>
                  <AppText variant="label">{name}</AppText>
                  <AppText variant="label">
                    {formatAggregateMoney(c.spending)}
                  </AppText>
                </View>
                <View style={styles.categoryBarTrack}>
                  <View
                    style={[
                      styles.categoryBarFill,
                      {
                        width: `${barWidth}%`,
                        backgroundColor: isRefund
                          ? colors.apricot
                          : colors.action,
                      },
                    ]}
                  />
                </View>
                <AppText tone="secondary" style={styles.componentCount}>
                  {c.count} {c.count === 1 ? "component" : "components"}
                </AppText>
              </View>
            );
          })}
        </View>
      )}
    </Panel>
  );
}

export function TrendSection({
  report,
}: {
  report: SpendingReport;
}): React.JSX.Element | null {
  if (!report.trend || report.trend.length === 0) return null;

  return (
    <Panel>
      <AppText variant="title">Six-month view</AppText>
      <AppText tone="secondary">
        Incomplete months are labelled. Comparisons require complete history and
        review.
      </AppText>

      <View style={styles.trendList}>
        {report.trend.map((m) => (
          <View key={m.month} style={styles.trendRow}>
            <View style={styles.trendMonth}>
              <AppText variant="label">{m.month}</AppText>
              <AppText tone="secondary" style={styles.trendStatus}>
                {m.complete ? "Complete" : "Incomplete"}
              </AppText>
            </View>
            <View style={styles.trendAmounts}>
              <AppText variant="label">
                Spend: {formatAggregateMoney(m.spending)}
              </AppText>
              <AppText tone="secondary">
                Income: {formatAggregateMoney(m.income)}
              </AppText>
            </View>
          </View>
        ))}
      </View>

      {report.comparison ? (
        <AppText tone="secondary">
          Change from {report.comparison.previousMonth}:{" "}
          {formatAggregateMoney(report.comparison.change)}
        </AppText>
      ) : (
        <AppText tone="secondary" style={styles.hint}>
          A like-for-like comparison is unavailable until both months have
          complete history and reviewed classifications.
        </AppText>
      )}
    </Panel>
  );
}

export function CashBridgeSection({
  report,
}: {
  report: SpendingReport;
}): React.JSX.Element | null {
  const summary = report.summary;
  if (!summary) return null;

  const bridgeItems = [
    ["Transfer inflow", summary.transferIn],
    ["Transfer outflow", summary.transferOut],
    ["Debt service outflow", summary.debtServiceOut],
    ["Debt settlement inflow", summary.debtSettlementIn],
    ["Principal inflow", summary.principalIn],
    ["Principal outflow", summary.principalOut],
    ["Contribution inflow", summary.contributionIn],
    ["Contribution outflow", summary.contributionOut],
    ["Unclassified inflow", summary.unclassifiedIn],
    ["Unclassified outflow", summary.unclassifiedOut],
  ] as const;

  return (
    <Panel>
      <AppText variant="title">Cash movement bridge</AppText>
      <AppText tone="secondary">
        Spending is separate from movements between accounts, debt, and
        investments.
      </AppText>

      <View style={styles.bridgeList}>
        {bridgeItems.map(([label, money]) => (
          <View key={label} style={styles.bridgeRow}>
            <AppText tone="secondary">{label}</AppText>
            <AppText variant="label">{formatAggregateMoney(money)}</AppText>
          </View>
        ))}
      </View>
    </Panel>
  );
}

export function MonthlyReviewScreen(): React.JSX.Element | null {
  const { authority } = useNativeFinance();
  const requested = monthSchema.safeParse(useLocalSearchParams().month);
  const current = currentMobileMonth();
  const initialMonth =
    requested.success && requested.data <= current ? requested.data : current;
  return authority ? (
    <MonthlyReviewContent
      key={`${financeAuthorityKey(authority)}:${requested.success ? requested.data : ""}`}
      initialMonth={initialMonth}
    />
  ) : null;
}

export function MonthlyReviewContent({
  initialMonth,
}: {
  initialMonth: string;
}): React.JSX.Element | null {
  const router = useRouter();
  const { authority, spending } = useNativeFinance();
  const [month, setMonth] = useState(initialMonth);
  const result = useSpendingReport(month);
  const goalsResult = useGoalsData();

  if (!authority) return null;

  return (
    <Screen>
      <AppText variant="heading" tone="inverse" accessibilityRole="header">
        Monthly review
      </AppText>

      <MonthSelector
        month={month}
        onPrevious={() => setMonth((m) => previousMonth(m))}
        onNext={() => setMonth((m) => nextMonth(m))}
      />

      {result.kind === "loading" && (
        <Panel>
          <AppText accessibilityLiveRegion="polite" tone="secondary">
            Loading review data…
          </AppText>
        </Panel>
      )}

      {result.kind === "error" && (
        <Panel>
          <AppText accessibilityLiveRegion="polite" style={styles.errorText}>
            {result.message}
          </AppText>
          <NativeActions>
            <NativeAction label="Try again" onPress={result.reload} />
          </NativeActions>
        </Panel>
      )}

      {result.kind === "ready" &&
        (result.value.scope.length === 0 ? (
          <Panel>
            <AppText variant="title">
              Your picture starts with an account
            </AppText>
            <AppText tone="secondary">
              No accounts with Values and details access are available.
            </AppText>
            <NativeActions>
              <NativeAction
                label="Open accounts"
                onPress={() => router.push("/home/accounts")}
              />
            </NativeActions>
          </Panel>
        ) : (
          <>
            <CashFlowSummary report={result.value} />
            <SavingsImpactCard
              scheduledSavingsMinor="0"
              capLines={(result.value.budget?.lines ?? []).map((line) => ({
                limitMinor: line.limit.amountMinor,
                actualMinor: categoryActual(result.value, line.category)
                  .amountMinor,
              }))}
            />
            <MonthEndSurplusCard
              report={result.value}
              goals={goalsResult.goals}
              onConfirmAllocation={(goalId) => {
                router.push(`/goals/${goalId}`);
              }}
            />
            <CoverageCard
              report={result.value}
              householdId={authority.householdId}
              spending={spending}
              refresh={result.reload}
            />
            <CategoryBreakdownSection report={result.value} />
            <TrendSection report={result.value} />
            <CashBridgeSection report={result.value} />

            <Panel>
              <AppText variant="title">Actions and review</AppText>
              {result.value.summary && (
                <AppText tone="secondary">
                  {result.value.summary.unreviewedCount} unreviewed components ·{" "}
                  {result.value.summary.unclassifiedCount} unclassified
                  components
                </AppText>
              )}
              <NativeActions>
                <NativeAction
                  label="View budget caps"
                  onPress={() => router.push("/budgets")}
                />
                <NativeAction
                  label="Open activity"
                  tone="secondary"
                  onPress={() => router.push("/activity")}
                />
                <NativeAction
                  label="Import transactions"
                  tone="secondary"
                  onPress={() => router.push("/imports")}
                />
              </NativeActions>
            </Panel>
          </>
        ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  heroHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  completeBadge: {
    color: colors.action,
  },
  incompleteBadge: {
    color: colors.secondary,
  },
  statGrid: {
    flexDirection: "row",
    gap: spacing.medium,
    paddingTop: spacing.small,
  },
  statBox: {
    flex: 1,
    gap: 4,
  },
  categoryList: {
    gap: spacing.medium,
  },
  categoryRow: {
    gap: 4,
  },
  categoryHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  categoryBarTrack: {
    height: 8,
    backgroundColor: colors.sage,
    borderRadius: corners.action,
    overflow: "hidden",
  },
  categoryBarFill: {
    height: 8,
    borderRadius: corners.action,
  },
  componentCount: {
    fontSize: 12,
  },
  trendList: {
    gap: spacing.small,
  },
  trendRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 4,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  trendMonth: {
    gap: 2,
  },
  trendStatus: {
    fontSize: 12,
  },
  trendAmounts: {
    alignItems: "flex-end",
    gap: 2,
  },
  bridgeList: {
    gap: spacing.small,
  },
  bridgeRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 2,
  },
  hint: {
    fontSize: 13,
    lineHeight: 18,
  },
  errorText: {
    color: colors.error,
  },
});
