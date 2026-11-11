import type { PropsWithChildren, ReactElement } from "react";
import type { AccountResponse } from "@joint/contracts";
import { FlatList, StyleSheet, View } from "react-native";
import { AppText } from "@/components/app-text";
import { EmptyState } from "@/components/empty-state";
import { NativeActions } from "@/components/native-actions";
import { NativeAction } from "@/components/native-action";
import { Panel } from "@/components/panel";
import { spacing } from "@/theme/tokens";
import { useAccountPage } from "./use-account-page";

export function AccountPage({
  children,
  renderAccount,
  extraData,
  onAddAccount,
}: PropsWithChildren<{
  renderAccount(account: AccountResponse): ReactElement;
  extraData?: unknown;
  onAddAccount?: () => void;
}>): React.JSX.Element {
  const page = useAccountPage();
  const result = page.resource;
  const header = (
    <View style={styles.sections}>
      {children}
      {result.kind === "ready" && result.value.items.length > 0 && (
        <View style={styles.pageLabel}>
          <AppText variant="label" tone="inverse" accessibilityRole="header">
            Visible accounts
          </AppText>
          <AppText tone="inverse">
            {result.value.items.length} on this page
          </AppText>
        </View>
      )}
    </View>
  );
  return (
    <FlatList
      data={result.kind === "ready" ? result.value.items : []}
      extraData={extraData}
      keyExtractor={(account) => account.id}
      renderItem={({ item }) => renderAccount(item)}
      ItemSeparatorComponent={() => <View style={styles.separator} />}
      ListHeaderComponent={header}
      ListHeaderComponentStyle={styles.header}
      ListEmptyComponent={
        result.kind === "loading" ? (
          <Panel>
            <AppText accessibilityLiveRegion="polite">
              Loading accounts…
            </AppText>
          </Panel>
        ) : result.kind === "error" ? (
          <Panel>
            <AppText accessibilityLiveRegion="polite">{result.message}</AppText>
            <NativeActions>
              <NativeAction label="Retry accounts" onPress={result.retry} />
              <NativeAction
                label="Return to first account page"
                onPress={page.reset}
                tone="secondary"
              />
            </NativeActions>
          </Panel>
        ) : page.firstPage && onAddAccount ? (
          <EmptyState
            title="No accounts yet"
            description="Add an account to record a value or import a statement."
          >
            <NativeActions>
              <NativeAction
                label="Add your first account"
                onPress={onAddAccount}
              />
            </NativeActions>
          </EmptyState>
        ) : (
          <EmptyState
            title="No accounts on this page"
            description={
              page.firstPage
                ? "No visible accounts have been recorded for this household."
                : "Return to the first page to refresh the account list."
            }
          />
        )
      }
      ListFooterComponent={
        <View style={styles.footer}>
          <NativeActions>
            {!page.firstPage && (
              <NativeAction
                label="Previous account page"
                disabled={!page.canGoBack || result.kind === "loading"}
                onPress={page.previous}
                tone="secondary"
              />
            )}
            {result.kind === "ready" && result.value.nextCursor && (
              <NativeAction label="Next account page" onPress={page.next} />
            )}
            {!page.firstPage && result.kind !== "error" && (
              <NativeAction
                label="Return to first account page"
                onPress={page.reset}
                tone="secondary"
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
  pageLabel: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "baseline",
    justifyContent: "space-between",
    columnGap: spacing.small,
  },
  header: { marginBottom: spacing.medium },
  separator: { height: spacing.medium },
  footer: { paddingTop: spacing.medium },
});
