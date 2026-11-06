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
      <Screen>
        <Panel>
          <AppText accessibilityLiveRegion="polite">Loading accounts…</AppText>
        </Panel>
      </Screen>
    );
  if (accounts.kind === "error")
    return (
      <Screen>
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
  const items = accounts.value.items;
  const account: AccountResponse | undefined =
    items.find((item) => item.id === chosen) ?? items[0];
  if (!account)
    return (
      <Screen>
        <EmptyState
          title="No accounts to show"
          description="Activity needs a visible account. Create or join an account from Home first."
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
    <Screen scrollable={false}>
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
      <ActivityPage
        key={account.id}
        account={account}
        onOpen={(transactionId) => router.push(`/activity/${transactionId}`)}
      />
    </Screen>
  );
}
