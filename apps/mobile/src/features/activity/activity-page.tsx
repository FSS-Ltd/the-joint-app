import { useState, type PropsWithChildren } from "react";
import { FlatList, StyleSheet, View } from "react-native";
import type { AccountResponse } from "@joint/contracts";
import { AppText } from "@/components/app-text";
import { EmptyState } from "@/components/empty-state";
import { NativeAction } from "@/components/native-action";
import { NativeActions } from "@/components/native-actions";
import { Panel } from "@/components/panel";
import { spacing } from "@/theme/tokens";
import { grantLabels, ownerLabel } from "../accounts/account-labels";
import { useNativeFinance } from "../finance/context";
import { financeAuthorityKey } from "../finance/scope";
import { useFinanceResource } from "../finance/use-resource";
import {
  activityFilters,
  activityQuery,
  activitySelector,
  emptyActivityFilters,
  type ActivityFilterDraft,
} from "./activity-query";
import { TransactionRow } from "./transaction-row";
import { ActivityFilterControls } from "./activity-filter-controls";

export function ActivityPage({
  account,
  onOpen,
  onReviewImports,
  children,
}: PropsWithChildren<{
  account: AccountResponse;
  onOpen(transactionId: string): void;
  onReviewImports?: () => void;
}>): React.JSX.Element {
  const finance = useNativeFinance();
  const authority = finance.authority;
  const [applied, setApplied] =
    useState<ActivityFilterDraft>(emptyActivityFilters);
  const filters = activityFilters(applied);
  const key = `${authority ? financeAuthorityKey(authority) : "unavailable"}:${account.id}:${JSON.stringify(filters)}`;
  const [page, setPage] = useState<{
    key: string;
    cursor?: string;
    previous: (string | undefined)[];
  }>({ key, previous: [] });
  // A refreshed authority or changed filter discards navigation history.
  const current =
    page.key === key ? page : { key, previous: [] as (string | undefined)[] };
  const selector = activitySelector(
    authority?.householdId ?? "00000000-0000-4000-8000-000000000000",
    account.id,
    current.cursor,
    filters,
  );
  const result = useFinanceResource(selector, (scope, signal) => {
    if (scope.selector.kind !== "transactions")
      throw new Error("Expected transaction page scope.");
    return finance.transactions.list(
      scope.householdId,
      activityQuery(scope.selector),
      signal,
    );
  });
  const filterCount =
    Number(Boolean(applied.month)) +
    Number(applied.classification !== "ALL") +
    Number(applied.uncategorizedOnly);
  const access =
    account.ownership === "OWNED"
      ? (account.sharing?.level ?? "NONE")
      : account.access;
  const header = (
    <View style={styles.sections}>
      <View>
        <AppText variant="title" tone="inverse" accessibilityRole="header">
          {account.label}
        </AppText>
        <AppText tone="inverse">
          {ownerLabel(account)} · {grantLabels[access]}
        </AppText>
      </View>
      {children}
      <ActivityFilterControls
        applied={applied}
        filterCount={filterCount}
        onChange={setApplied}
      />
      <View style={styles.pageLabel}>
        <AppText variant="label" tone="inverse" accessibilityRole="header">
          {current.cursor || filterCount || applied.search
            ? "Transactions"
            : "Recent transactions"}
        </AppText>
        {result.kind === "ready" && (
          <AppText tone="inverse">
            {result.value.items.length} on this page
          </AppText>
        )}
      </View>
    </View>
  );
  return (
    <FlatList
      data={result.kind === "ready" ? result.value.items : []}
      keyExtractor={(transaction) => transaction.id}
      renderItem={({ item }) => (
        <TransactionRow transaction={item} onOpen={onOpen} />
      )}
      ItemSeparatorComponent={() => <View style={styles.separator} />}
      ListHeaderComponent={header}
      ListHeaderComponentStyle={styles.header}
      ListEmptyComponent={
        result.kind === "loading" ? (
          <Panel>
            <AppText accessibilityLiveRegion="polite">
              Loading activity…
            </AppText>
          </Panel>
        ) : result.kind === "error" ? (
          <Panel>
            <AppText accessibilityLiveRegion="polite">{result.message}</AppText>
            <NativeActions>
              <NativeAction label="Retry activity" onPress={result.retry} />
            </NativeActions>
          </Panel>
        ) : (
          <EmptyState
            title="No transactions on this page"
            description={
              current.cursor
                ? "Return to the first page or change the filters."
                : "No committed transactions match the current account and filters."
            }
          />
        )
      }
      ListFooterComponent={
        <View style={styles.footer}>
          <NativeActions>
            {current.cursor !== undefined && (
              <NativeAction
                label="Previous activity page"
                disabled={
                  current.previous.length === 0 || result.kind === "loading"
                }
                onPress={() =>
                  setPage({
                    key,
                    ...(current.previous.at(-1) !== undefined
                      ? { cursor: current.previous.at(-1) }
                      : {}),
                    previous: current.previous.slice(0, -1),
                  })
                }
                tone="secondary"
              />
            )}
            {result.kind === "ready" && result.value.nextCursor && (
              <NativeAction
                label="Next activity page"
                onPress={() => {
                  if (
                    !authority ||
                    !finance.isCurrent(authority) ||
                    !result.value.nextCursor
                  )
                    return;
                  setPage({
                    key,
                    cursor: result.value.nextCursor,
                    previous: [...current.previous, current.cursor].slice(-64),
                  });
                }}
              />
            )}
          </NativeActions>
          {onReviewImports && (
            <Panel>
              <AppText variant="title" accessibilityRole="header">
                CSV imports
              </AppText>
              <NativeActions>
                <NativeAction
                  label="Review CSV imports"
                  tone="secondary"
                  onPress={onReviewImports}
                />
              </NativeActions>
            </Panel>
          )}
        </View>
      }
      contentContainerStyle={styles.list}
    />
  );
}

const styles = StyleSheet.create({
  list: { paddingBottom: spacing.large },
  sections: { gap: spacing.medium },
  pageLabel: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    columnGap: spacing.small,
  },
  header: { marginBottom: spacing.medium },
  separator: { height: spacing.medium },
  footer: { paddingTop: spacing.medium, gap: spacing.medium },
});
