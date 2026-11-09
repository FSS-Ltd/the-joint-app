import { useState } from "react";
import { useRouter } from "expo-router";
import { View, StyleSheet } from "react-native";
import { randomUUID } from "expo-crypto";
import { monthEndAtOffset } from "@joint/contracts";
import { Screen } from "@/components/screen";
import { AppText } from "@/components/app-text";
import { BrandMark } from "@/components/brand-mark";
import { Panel } from "@/components/panel";
import { NativeActions } from "@/components/native-actions";
import { NativeAction } from "@/components/native-action";
import { colors, spacing } from "@/theme/tokens";
import { useNativeFinance } from "../finance/context";
import { useGoalDetailData } from "./use-goal-detail-data";
import { GoalProgressCard } from "./goal-progress-card";
import { GoalTimelineFeedbackCard } from "./goal-timeline-feedback-card";
import { ProjectionBreakdownCard } from "./projection-breakdown-card";
import { AllocationEditorCard } from "./allocation-editor-card";
import { ContributionPlanCard } from "./contribution-plan-card";

export function GoalDetailScreen({
  goalId,
}: {
  goalId: string;
}): React.JSX.Element {
  const router = useRouter();
  const finance = useNativeFinance();
  const authority = finance.authority;
  const {
    goal,
    allocations,
    contributions,
    latestProjection,
    loading,
    error,
    reload,
  } = useGoalDetailData(goalId);
  const [calculating, setCalculating] = useState(false);
  const [calcError, setCalcError] = useState<string | null>(null);

  // Compute allocated funds
  let allocatedMinor = 0n;
  for (const alloc of allocations?.view.allocations ?? []) {
    if (alloc.basis === "FIXED") {
      allocatedMinor += BigInt(alloc.amount.amountMinor);
    }
  }

  const runBasicProjection = async () => {
    if (!authority || !goal) return;
    setCalculating(true);
    setCalcError(null);
    try {
      const planEntry = contributions?.plans.find(
        (p) => p.plan.goalId === goalId,
      );
      const monthlyAmount = planEntry?.plan.monthlyContributions[0]?.amount ?? {
        amountMinor: "0",
        currency: goal.target.currency,
      };

      const firstContributionDate =
        planEntry?.plan.firstContributionDate ??
        monthEndAtOffset(new Date().toISOString().slice(0, 10), 0);

      const key = randomUUID();
      await finance.goals.createBasicProjection(
        authority.householdId,
        goalId,
        {
          schema: "projection-input",
          schemaVersion: 1,
          mode: "BASIC",
          targetBasis: "FIXED_NOMINAL",
          opening: {
            amountMinor: String(allocatedMinor),
            currency: goal.target.currency,
          },
          target: goal.target,
          firstContributionDate,
          horizonMonths: 24,
          monthlyContributions: [
            {
              fromMonth: 1,
              amount: monthlyAmount,
            },
          ],
        },
        key,
      );
      reload();
    } catch (err: unknown) {
      setCalcError(
        err instanceof Error ? err.message : "Failed to calculate projection.",
      );
    } finally {
      setCalculating(false);
    }
  };

  return (
    <Screen scrollable>
      <BrandMark compact />
      <AppText variant="heading" tone="inverse" accessibilityRole="header">
        {goal?.name ?? "Goal Detail"}
      </AppText>

      <NativeActions>
        <NativeAction
          label="Back to all goals"
          tone="secondary"
          onPress={() => router.push("/goals")}
        />
      </NativeActions>

      {loading ? (
        <Panel>
          <AppText accessibilityLiveRegion="polite">
            Loading goal details…
          </AppText>
        </Panel>
      ) : error || !goal ? (
        <Panel>
          <AppText tone="secondary" style={styles.errorText}>
            Unable to load goal: {error ?? "Goal not found"}
          </AppText>
          <NativeActions>
            <NativeAction label="Retry" onPress={reload} />
          </NativeActions>
        </Panel>
      ) : (
        <View style={styles.contentStack}>
          <GoalProgressCard goal={goal} allocatedMinor={allocatedMinor} />

          <GoalTimelineFeedbackCard
            inputs={{
              targetMinor: goal.target.amountMinor,
              allocatedMinor: String(allocatedMinor),
              monthlyContributionMinor: contributions?.plans.find(
                (p) => p.plan.goalId === goalId,
              )?.plan.monthlyContributions[0]?.amount.amountMinor,
              hasOpeningBalance: allocations !== null,
              sourceAccessRevoked: allocations === null && !loading,
            }}
          />

          {latestProjection ? (
            <>
              <ProjectionBreakdownCard run={latestProjection} />
              <NativeActions>
                <NativeAction
                  label={
                    calculating ? "Calculating…" : "Recalculate projection"
                  }
                  tone="secondary"
                  disabled={calculating}
                  onPress={runBasicProjection}
                />
              </NativeActions>
            </>
          ) : (
            <Panel>
              <AppText variant="title">Deterministic projection</AppText>
              <AppText tone="secondary">
                Model whether this goal is reachable under current savings rates
                and allocations.
              </AppText>
              <NativeActions>
                <NativeAction
                  label={calculating ? "Calculating…" : "Model projection"}
                  disabled={calculating}
                  onPress={runBasicProjection}
                />
              </NativeActions>
            </Panel>
          )}

          {calcError && (
            <Panel>
              <AppText tone="secondary" style={styles.errorText}>
                {calcError}
              </AppText>
            </Panel>
          )}

          <AllocationEditorCard allocationsPage={allocations} />

          <ContributionPlanCard contributions={contributions} goalId={goalId} />
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  errorText: {
    color: colors.error,
  },
  contentStack: {
    gap: spacing.medium,
  },
});
