import { useState } from "react";
import { FlatList, StyleSheet, View } from "react-native";
import {
  classificationKindSchema,
  monthSchema,
  type AccountResponse,
  type ClassificationKind,
} from "@joint/contracts";
import { Host, Switch } from "@expo/ui";
import { AppText } from "@/components/app-text";
import { EmptyState } from "@/components/empty-state";
import { NativeAction } from "@/components/native-action";
import { NativeActions } from "@/components/native-actions";
import { NativeField } from "@/components/native-field";
import { Panel } from "@/components/panel";
import { spacing } from "@/theme/tokens";
import { AccountChoice } from "../accounts/account-choice";
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

type ClassificationOption = "ALL" | ClassificationKind;
const classifications = [
  "ALL",
  ...classificationKindSchema.options,
] as readonly ClassificationOption[];
const classificationLabels: Record<ClassificationOption, string> = {
  ALL: "All classifications",
  EXPENSE: "Expense",
  INCOME: "Income",
  REFUND: "Refund",
  TRANSFER: "Transfer",
  DEBT_PAYMENT: "Debt payment",
  PRINCIPAL: "Principal",
  CONTRIBUTION: "Contribution",
  UNCLASSIFIED: "Unclassified",
};

export function ActivityPage({
  account,
  onOpen,
}: {
  account: AccountResponse;
  onOpen(transactionId: string): void;
}): React.JSX.Element {
  const finance = useNativeFinance();
  const authority = finance.authority;
  const [draft, setDraft] = useState<ActivityFilterDraft>(emptyActivityFilters);
  const [applied, setApplied] =
    useState<ActivityFilterDraft>(emptyActivityFilters);
  const [filterError, setFilterError] = useState<string | null>(null);
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
  const apply = () => {
    if (draft.month && !monthSchema.safeParse(draft.month).success) {
      setFilterError("Enter a month as YYYY-MM.");
      return;
    }
    setFilterError(null);
    setApplied({ ...draft, search: draft.search.trim() });
  };
  const header = (
    <View style={styles.sections}>
      <Panel>
        <AppText variant="title" accessibilityRole="header">
          Activity
        </AppText>
        <AppText>
          {account.label} · up to 50 transactions per page. Each page replaces
          the previous page.
        </AppText>
        <NativeField
          label="Search transactions"
          value={draft.search}
          onChangeText={(search) => setDraft({ ...draft, search })}
          returnKeyType="search"
          onSubmitEditing={apply}
        />
        <NativeField
          label="Month filter"
          value={draft.month}
          onChangeText={(month) => setDraft({ ...draft, month })}
          placeholder="YYYY-MM"
          returnKeyType="done"
          onSubmitEditing={apply}
        />
        <AccountChoice
          label="Classification"
          value={draft.classification}
          options={classifications}
          labels={classificationLabels}
          onChange={(classification) =>
            setDraft({
              ...draft,
              classification: classification as ClassificationOption,
            })
          }
          disabled={false}
        />
        <Host matchContents={{ vertical: true }} colorScheme="light">
          <Switch
            label="Only uncategorized"
            value={draft.uncategorizedOnly}
            onValueChange={(uncategorizedOnly) =>
              setDraft({ ...draft, uncategorizedOnly })
            }
          />
        </Host>
        {filterError && (
          <AppText accessibilityLiveRegion="polite">{filterError}</AppText>
        )}
        <NativeActions>
          <NativeAction label="Apply activity filters" onPress={apply} />
          <NativeAction
            label="Clear activity filters"
            tone="secondary"
            onPress={() => {
              setFilterError(null);
              setDraft(emptyActivityFilters);
              setApplied(emptyActivityFilters);
            }}
          />
        </NativeActions>
      </Panel>
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
            {result.kind === "ready" && (
              <NativeAction
                label="Next activity page"
                disabled={!result.value.nextCursor}
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
        </View>
      }
      contentContainerStyle={styles.list}
    />
  );
}

const styles = StyleSheet.create({
  list: { paddingBottom: spacing.large },
  sections: { gap: spacing.medium },
  header: { marginBottom: spacing.medium },
  separator: { height: spacing.medium },
  footer: { paddingTop: spacing.medium },
});
