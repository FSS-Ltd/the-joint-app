import { useState } from "react";
import { useRouter } from "expo-router";
import type { AccountResponse } from "@joint/contracts";
import { AppText } from "@/components/app-text";
import { EmptyState } from "@/components/empty-state";
import { NativeAction } from "@/components/native-action";
import { NativeActions } from "@/components/native-actions";
import { Panel } from "@/components/panel";
import { Screen } from "@/components/screen";
import { AccountChoice } from "../accounts/account-choice";
import { useNativeFinance } from "../finance/context";
import { useFinanceResource } from "../finance/use-resource";
import { ActivityPage } from "./activity-page";

/** Activity is per-account; the existing account list is the only chooser. */
export function ActivityScreen(): React.JSX.Element {
  const finance = useNativeFinance();
  const router = useRouter();
  const authority = finance.authority;
  const accounts = useFinanceResource(
    {
      kind: "accounts",
      householdId:
        authority?.householdId ?? "00000000-0000-4000-8000-000000000000",
      limit: 50,
    },
    (scope, signal) => {
      if (scope.selector.kind !== "accounts")
        throw new Error("Expected account page scope.");
      return finance.accounts.list(
        scope.householdId,
        { limit: scope.selector.limit },
        signal,
      );
    },
  );
  const [chosen, setChosen] = useState<string | null>(null);
  if (accounts.kind === "loading")
    return (
      <Screen nativeHeader>
        <Panel>
          <AppText accessibilityLiveRegion="polite">Loading accounts…</AppText>
        </Panel>
      </Screen>
    );
  if (accounts.kind === "error")
    return (
      <Screen nativeHeader>
        <Panel>
          <AppText accessibilityLiveRegion="polite">{accounts.message}</AppText>
          <NativeActions>
            <NativeAction label="Retry accounts" onPress={accounts.retry} />
            <NativeAction
              label="Open accounts"
              tone="secondary"
              onPress={() => router.push("/home/accounts")}
            />
          </NativeActions>
        </Panel>
      </Screen>
    );
  const items = accounts.value.items.filter(
    (item) => item.access === "TRANSACTIONS",
  );
  const account: AccountResponse | undefined =
    items.find((item) => item.id === chosen) ?? items[0];
  if (!account)
    return (
      <Screen nativeHeader>
        <EmptyState
          title={
            accounts.value.nextCursor
              ? "No transaction access on this account page"
              : "No transaction access"
          }
          description="Activity shows transactions from accounts you can view in detail."
        />
        <NativeActions>
          <NativeAction
            label="Open accounts"
            onPress={() => router.push("/home/accounts")}
          />
        </NativeActions>
      </Screen>
    );
  const labels = Object.fromEntries(items.map((item) => [item.id, item.label]));
  return (
    <Screen nativeHeader scrollable={false}>
      <ActivityPage
        key={account.id}
        account={account}
        onOpen={(transactionId) => router.push(`/activity/${transactionId}`)}
        onReviewImports={
          account.ownership === "OWNED"
            ? () => router.push(`/imports/history/${account.id}`)
            : undefined
        }
      >
        {items.length > 1 && (
          <Panel>
            <AccountChoice
              label="Account"
              value={account.id}
              options={items.map((item) => item.id)}
              labels={labels}
              onChange={setChosen}
              disabled={false}
            />
          </Panel>
        )}
      </ActivityPage>
    </Screen>
  );
}
