import { useRouter } from "expo-router";
import { View, StyleSheet } from "react-native";
import { formatAggregateMoney } from "@joint/domain/cash-flow";
import { Screen } from "@/components/screen";
import { AppText } from "@/components/app-text";
import { BrandMark } from "@/components/brand-mark";
import { Panel } from "@/components/panel";
import { NativeActions } from "@/components/native-actions";
import { NativeAction } from "@/components/native-action";
import { colors, spacing } from "@/theme/tokens";
import { useGoalsData } from "./use-goals-data";
import { GoalProgressCard } from "./goal-progress-card";

export function GoalsScreen(): React.JSX.Element {
  const router = useRouter();
  const { goals, loading, error, reload } = useGoalsData();

  let totalTargetMinor = 0n;
  for (const g of goals) {
    totalTargetMinor += BigInt(g.target.amountMinor);
  }
  const totalTargetFormatted = formatAggregateMoney({
    amountMinor: String(totalTargetMinor),
    currency: "GBP",
  });

  return (
    <Screen scrollable>
      <BrandMark compact />
      <AppText variant="heading" tone="inverse" accessibilityRole="header">
        Goals & Wealth
      </AppText>

      <NativeActions>
        <NativeAction
          label="Back to home"
          tone="secondary"
          onPress={() => router.push("/home")}
        />
      </NativeActions>

      {loading ? (
        <Panel>
          <AppText accessibilityLiveRegion="polite">
            Loading savings goals…
          </AppText>
        </Panel>
      ) : error ? (
        <Panel>
          <AppText tone="secondary" style={styles.errorText}>
            Unable to load goals: {error}
          </AppText>
          <NativeActions>
            <NativeAction label="Retry" onPress={reload} />
          </NativeActions>
        </Panel>
      ) : goals.length === 0 ? (
        <Panel>
          <AppText variant="title">No goals configured</AppText>
          <AppText tone="secondary">
            Set up savings goals to track targeted milestones, earmark account
            balances, and model wealth projections.
          </AppText>
        </Panel>
      ) : (
        <>
          <Panel>
            <View style={styles.summaryContainer}>
              <AppText tone="secondary">Total savings targets</AppText>
              <AppText variant="heading" style={styles.summaryTotal}>
                {totalTargetFormatted}
              </AppText>
              <AppText tone="secondary">
                {goals.length} active goal{goals.length === 1 ? "" : "s"} in
                household
              </AppText>
            </View>
          </Panel>

          <View style={styles.goalsList}>
            {goals.map((goal) => (
              <GoalProgressCard
                key={goal.id}
                goal={goal}
                onPress={() => router.push(`/goals/${goal.id}`)}
              />
            ))}
          </View>
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  errorText: {
    color: colors.error,
  },
  summaryContainer: {
    alignItems: "center",
    gap: spacing.small / 2,
    paddingVertical: spacing.small,
  },
  summaryTotal: {
    fontSize: 32,
    lineHeight: 38,
    color: colors.forest,
  },
  goalsList: {
    gap: spacing.medium,
  },
});
