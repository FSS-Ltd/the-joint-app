import { useRouter } from "expo-router";
import { Pressable, StyleSheet, View } from "react-native";
import { formatAggregateMoney } from "@joint/domain/cash-flow";
import { AppText } from "@/components/app-text";
import { NativeAction } from "@/components/native-action";
import { NativeActions } from "@/components/native-actions";
import { Panel } from "@/components/panel";
import { colors, spacing } from "@/theme/tokens";
import { displayDate } from "../accounts/account-labels";
import { useAccountPage } from "../accounts/use-account-page";
import { activityQuery, activitySelector } from "../activity/activity-query";
import { useNativeFinance } from "../finance/context";
import { useFinanceResource } from "../finance/use-resource";
import type { SummaryScope } from "./summary-scope";

export function HomeActivity({
  scope,
}: {
  scope: SummaryScope;
}): React.JSX.Element {
  const router = useRouter();
  const { resource } = useAccountPage();
  const account =
    resource.kind === "ready"
      ? resource.value.items.find(
          ({ access, id }) =>
            access === "TRANSACTIONS" &&
            (scope.kind === "visible" || scope.accountIds.includes(id)),
        )
      : undefined;

  return (
    <View style={styles.section}>
      <AppText variant="title" tone="inverse" accessibilityRole="header">
        {account ? `Recent activity · ${account.label}` : "Recent activity"}
      </AppText>
      <Panel>
        {account ? (
          <RecentTransactions
            key={account.id}
            accountId={account.id}
            householdId={account.householdId}
          />
        ) : (
          <AppText tone="secondary" accessibilityLiveRegion="polite">
            {resource.kind === "loading"
              ? "Loading accounts…"
              : resource.kind === "error"
                ? resource.message
                : "Open the ledger to choose an account with transaction access."}
          </AppText>
        )}
        <NativeActions>
          <NativeAction
            label="View ledger"
            tone="secondary"
            onPress={() => router.push("/activity")}
          />
        </NativeActions>
      </Panel>
    </View>
  );
}

function RecentTransactions({
  accountId,
  householdId,
}: {
  accountId: string;
  householdId: string;
}): React.JSX.Element {
  const router = useRouter();
  const finance = useNativeFinance();
  const result = useFinanceResource(
    activitySelector(householdId, accountId, undefined, {}, 3),
    (scope, signal) => {
      if (scope.selector.kind !== "transactions")
        throw new Error("Expected transaction page scope.");
      return finance.transactions.list(
        scope.householdId,
        activityQuery(scope.selector),
        signal,
      );
    },
  );

  return (
    <View>
      {result.kind !== "ready" || result.value.items.length === 0 ? (
        <AppText tone="secondary" accessibilityLiveRegion="polite">
          {result.kind === "loading"
            ? "Loading transactions…"
            : result.kind === "error"
              ? result.message
              : "No transactions recorded yet."}
        </AppText>
      ) : (
        result.value.items.map((transaction) => {
          const negative = transaction.money.amountMinor.startsWith("-");
          const amount = formatAggregateMoney(transaction.money);
          return (
            <Pressable
              key={transaction.id}
              accessibilityRole="button"
              onPress={() => router.push(`/activity/${transaction.id}`)}
              style={({ pressed }) => [styles.row, pressed && styles.pressed]}
            >
              <View style={styles.description}>
                <AppText variant="label">{transaction.description}</AppText>
                <AppText tone="secondary">
                  {displayDate(transaction.bookedDate)} ·{" "}
                  {transaction.source === "CSV" ? "CSV" : "Manual"}
                </AppText>
              </View>
              <AppText
                variant="label"
                style={[styles.money, negative && styles.negative]}
              >
                {transaction.money.amountMinor !== "0" && !negative ? "+" : ""}
                {amount}
              </AppText>
            </Pressable>
          );
        })
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: spacing.small },
  row: {
    alignItems: "baseline",
    flexDirection: "row",
    flexWrap: "wrap",
    columnGap: spacing.small,
    minHeight: 44,
    paddingVertical: spacing.small,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  pressed: { backgroundColor: colors.sage },
  description: { flexGrow: 1, flexBasis: 140 },
  money: { fontVariant: ["tabular-nums"], flexShrink: 1 },
  negative: { color: colors.error },
});
