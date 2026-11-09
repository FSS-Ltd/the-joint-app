import { useState } from "react";
import { View, StyleSheet, Pressable } from "react-native";
import type { SpendingReport, GoalDto } from "@joint/contracts";
import { formatGbpMinor } from "@joint/domain/cash-flow";
import { AppText } from "@/components/app-text";
import { Panel } from "@/components/panel";
import { NativeAction } from "@/components/native-action";
import { NativeActions } from "@/components/native-actions";
import { colors, corners, spacing } from "@/theme/tokens";
import { categoryActual } from "../budgets/cap-math";
import { calculateHouseholdSavingsImpact } from "../budgets/savings-impact";

export function MonthEndSurplusCard({
  report,
  goals,
  onConfirmAllocation,
}: {
  report: SpendingReport;
  goals: readonly GoalDto[];
  onConfirmAllocation?: (
    goalId: string,
    amountMinor: string,
  ) => Promise<void> | void;
}): React.JSX.Element {
  const [selectedGoalId, setSelectedGoalId] = useState<string>(
    goals[0]?.id ?? "",
  );
  const [isAllocating, setIsAllocating] = useState(false);
  const [allocatedSuccess, setAllocatedSuccess] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const lines = report.budget?.lines ?? [];
  const capLines = lines.map((line) => ({
    limitMinor: line.limit.amountMinor,
    actualMinor: categoryActual(report, line.category).amountMinor,
  }));

  const impact = calculateHouseholdSavingsImpact("0", capLines);
  const netUnderspend = BigInt(impact.netUnderspendMinor);
  const hasUnderspend = netUnderspend > 0n;
  const isComplete = report.coverage.complete;

  const handleAllocate = async () => {
    if (
      !isComplete ||
      !selectedGoalId ||
      !hasUnderspend ||
      !onConfirmAllocation
    ) {
      return;
    }
    setIsAllocating(true);
    setErrorMessage(null);
    try {
      await onConfirmAllocation(selectedGoalId, impact.netUnderspendMinor);
      setAllocatedSuccess(true);
    } catch (err: unknown) {
      setErrorMessage(
        err instanceof Error ? err.message : "Failed to record allocation.",
      );
    } finally {
      setIsAllocating(false);
    }
  };

  const selectedGoal = goals.find((g) => g.id === selectedGoalId);

  return (
    <Panel>
      <View style={styles.header}>
        <AppText variant="title" style={styles.title}>
          Month-end surplus allocation
        </AppText>
        <AppText tone="secondary">
          Allocate verified unspent budget allowances toward active wealth
          goals.
        </AppText>
      </View>

      {!isComplete ? (
        <View style={styles.noticeBox}>
          <AppText variant="label" style={styles.lockedNotice}>
            Locked: Month review incomplete
          </AppText>
          <AppText tone="secondary" style={styles.noticeText}>
            Unallocated cap allowances cannot be verified until all linked
            accounts are reviewed and period coverage is complete.
          </AppText>
        </View>
      ) : !hasUnderspend ? (
        <View style={styles.noticeBox}>
          <AppText tone="secondary" style={styles.noticeText}>
            No verified cap surplus this month. Spending matched or exceeded
            active budget limits.
          </AppText>
        </View>
      ) : allocatedSuccess ? (
        <View style={styles.noticeBox}>
          <AppText variant="label" style={styles.successText}>
            Surplus allocated: {formatGbpMinor(netUnderspend)}
          </AppText>
          <AppText tone="secondary" style={styles.noticeText}>
            Allocated to {selectedGoal?.name ?? "selected goal"}. Intention
            recorded without initiating bank transfers.
          </AppText>
        </View>
      ) : (
        <View style={styles.contentStack}>
          <View style={styles.surplusStatBox}>
            <AppText tone="secondary">Verified cap surplus</AppText>
            <AppText variant="heading" style={styles.surplusAmount}>
              {formatGbpMinor(netUnderspend)}
            </AppText>
            <AppText tone="secondary" style={styles.disclaimerText}>
              Earmarking intention only. No bank transfer or observed
              contribution is created.
            </AppText>
          </View>

          {goals.length === 0 ? (
            <AppText tone="secondary">
              No active goals available. Create a wealth goal first to assign
              surplus savings.
            </AppText>
          ) : (
            <View style={styles.goalSelectionContainer}>
              <AppText variant="label" tone="secondary">
                Select target goal
              </AppText>
              <View style={styles.goalChips}>
                {goals.map((g) => {
                  const isSelected = g.id === selectedGoalId;
                  return (
                    <Pressable
                      key={g.id}
                      accessibilityRole="button"
                      accessibilityState={{ selected: isSelected }}
                      accessibilityLabel={`Select goal ${g.name}`}
                      style={[
                        styles.goalChip,
                        isSelected ? styles.goalChipSelected : undefined,
                      ]}
                      onPress={() => setSelectedGoalId(g.id)}
                    >
                      <AppText
                        variant="label"
                        style={
                          isSelected
                            ? styles.goalChipTextSelected
                            : styles.goalChipText
                        }
                      >
                        {g.name}
                      </AppText>
                    </Pressable>
                  );
                })}
              </View>

              {errorMessage && (
                <AppText style={styles.errorText}>{errorMessage}</AppText>
              )}

              <NativeActions>
                <NativeAction
                  label={
                    !onConfirmAllocation
                      ? "Allocation confirmation unavailable"
                      : isAllocating
                        ? "Recording allocation…"
                        : `Confirm ${formatGbpMinor(netUnderspend)} allocation`
                  }
                  disabled={
                    isAllocating || !selectedGoalId || !onConfirmAllocation
                  }
                  onPress={handleAllocate}
                />
              </NativeActions>
            </View>
          )}
        </View>
      )}
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
  contentStack: {
    gap: spacing.medium,
    marginTop: spacing.small,
  },
  noticeBox: {
    marginTop: spacing.small,
    padding: spacing.small,
    backgroundColor: colors.white,
    borderRadius: corners.surface,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 4,
  },
  lockedNotice: {
    color: colors.action,
  },
  successText: {
    color: colors.forest,
  },
  noticeText: {
    fontSize: 13,
    lineHeight: 18,
  },
  surplusStatBox: {
    backgroundColor: colors.white,
    padding: spacing.medium,
    borderRadius: corners.surface,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 4,
  },
  surplusAmount: {
    fontSize: 24,
    fontWeight: "700",
    color: colors.forest,
  },
  disclaimerText: {
    fontSize: 12,
    lineHeight: 16,
  },
  goalSelectionContainer: {
    gap: spacing.small,
  },
  goalChips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.small,
  },
  goalChip: {
    paddingVertical: spacing.small / 2,
    paddingHorizontal: spacing.small,
    borderRadius: corners.action,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
  },
  goalChipSelected: {
    backgroundColor: colors.forest,
    borderColor: colors.forest,
  },
  goalChipText: {
    fontSize: 13,
    color: colors.forest,
  },
  goalChipTextSelected: {
    fontSize: 13,
    color: colors.white,
  },
  errorText: {
    color: colors.error,
    fontSize: 13,
  },
});
