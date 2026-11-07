import { useState } from "react";
import { useRouter } from "expo-router";
import { AppText } from "@/components/app-text";
import { EmptyState } from "@/components/empty-state";
import { NativeAction } from "@/components/native-action";
import { NativeActions } from "@/components/native-actions";
import { Panel } from "@/components/panel";
import { Screen } from "@/components/screen";
import { AccountChoice } from "../accounts/account-choice";
import { useNativeFinance } from "../finance/context";
import { useFinanceResource } from "../finance/use-resource";

/** Imports belong to an account the user owns; the existing account list is the chooser. */
export function ImportAccountsScreen(): React.JSX.Element {
  const finance = useNativeFinance();
  const router = useRouter();
  const accounts = useFinanceResource(
    {
      kind: "accounts",
      householdId:
        finance.authority?.householdId ??
        "00000000-0000-4000-8000-000000000000",
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
          </NativeActions>
        </Panel>
      </Screen>
    );
  const owned = accounts.value.items.filter((i) => i.ownership === "OWNED");
  const account = owned.find((i) => i.id === chosen) ?? owned[0];
  if (!account)
    return (
      <Screen>
        <EmptyState
          title="No accounts to import into"
          description="Only an account you own can receive an import. Create one from Home first."
        />
        <NativeActions>
          <NativeAction
            label="Open accounts"
            onPress={() => router.push("/home/accounts")}
          />
        </NativeActions>
      </Screen>
    );
  return (
    <Screen>
      <Panel>
        <AppText variant="heading" accessibilityRole="header">
          Import transactions
        </AppText>
        <AppText>
          Choose the account that the CSV belongs to. You will review every row
          before anything is added.
        </AppText>
        <AccountChoice
          label="Account"
          value={account.id}
          options={owned.map((i) => i.id)}
          labels={Object.fromEntries(owned.map((i) => [i.id, i.label]))}
          onChange={setChosen}
          disabled={false}
        />
        {accounts.value.nextCursor && (
          <AppText tone="secondary">Showing your first 50 accounts.</AppText>
        )}
        <NativeActions>
          <NativeAction
            label="Continue"
            onPress={() => router.push(`/imports/upload/${account.id}`)}
          />
        </NativeActions>
      </Panel>
    </Screen>
  );
}
