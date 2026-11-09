import { View, StyleSheet } from "react-native";
import type { GoalAllocationPage } from "@joint/contracts";
import { formatAggregateMoney } from "@joint/domain/cash-flow";
import { AppText } from "@/components/app-text";
import { Panel } from "@/components/panel";
import { colors, corners, spacing } from "@/theme/tokens";

export function AllocationEditorCard({
  allocationsPage,
}: {
  allocationsPage: GoalAllocationPage | null;
}): React.JSX.Element {
  const allocations = allocationsPage?.view.allocations ?? [];

  let totalAllocatedMinor = 0n;
  for (const alloc of allocations) {
    if (alloc.basis === "FIXED") {
      totalAllocatedMinor += BigInt(alloc.amount.amountMinor);
    }
  }

  const totalFormatted = formatAggregateMoney({
    amountMinor: String(totalAllocatedMinor),
    currency: "GBP",
  });

  return (
    <Panel>
      <View style={styles.header}>
        <AppText variant="title" style={styles.title}>
          Allocated funding
        </AppText>
        <AppText tone="secondary">
          Accounts earmarked for this goal. Allocations do not lock or transfer
          money; they represent intentional assignment.
        </AppText>
      </View>

      <View style={styles.summaryBox}>
        <AppText tone="secondary">Total earmarked balance</AppText>
        <AppText variant="heading" style={styles.totalValue}>
          {totalFormatted}
        </AppText>
        <AppText tone="secondary" style={styles.sourceCount}>
          {allocations.length} source account
          {allocations.length === 1 ? "" : "s"} assigned
        </AppText>
      </View>

      {allocations.length === 0 ? (
        <View style={styles.emptyBox}>
          <AppText tone="secondary">
            No accounts allocated to this goal yet.
          </AppText>
        </View>
      ) : (
        <View style={styles.allocationsList}>
          {allocations.map((alloc) => {
            const amountFormatted =
              alloc.basis === "FIXED"
                ? formatAggregateMoney(alloc.amount)
                : `${(Number(alloc.fraction) * 100).toFixed(0)}% of account balance`;

            return (
              <View
                key={alloc.accountId}
                style={styles.allocationRow}
                accessible
              >
                <View style={styles.allocInfo}>
                  <AppText variant="label" style={styles.accountLabel}>
                    Account ···{alloc.accountId.slice(-4)}
                  </AppText>
                  <AppText tone="secondary" style={styles.basisLabel}>
                    {alloc.basis === "FIXED"
                      ? "Fixed allocation"
                      : "Ratio allocation"}
                  </AppText>
                </View>
                <AppText variant="body" style={styles.allocAmount}>
                  {amountFormatted}
                </AppText>
              </View>
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
  title: {
    fontSize: 18,
    lineHeight: 24,
    color: colors.forest,
  },
  summaryBox: {
    backgroundColor: colors.white,
    padding: spacing.medium,
    borderRadius: corners.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    gap: spacing.small / 2,
  },
  totalValue: {
    fontSize: 28,
    lineHeight: 34,
    color: colors.action,
  },
  sourceCount: {
    fontSize: 13,
  },
  emptyBox: {
    padding: spacing.small,
    alignItems: "center",
  },
  allocationsList: {
    backgroundColor: colors.white,
    borderRadius: corners.surface,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: "hidden",
  },
  allocationRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: spacing.medium,
    paddingVertical: spacing.small,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  allocInfo: {
    gap: 2,
  },
  accountLabel: {
    fontSize: 14,
    color: colors.forest,
  },
  basisLabel: {
    fontSize: 12,
  },
  allocAmount: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.forest,
  },
});
