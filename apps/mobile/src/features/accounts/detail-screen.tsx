import { AppText } from "@/components/app-text";
import { NativeActions } from "@/components/native-actions";
import { NativeAction } from "@/components/native-action";
import { Panel } from "@/components/panel";
import { Screen } from "@/components/screen";
import { useNativeFinance } from "../finance/context";
import { useFinanceResource } from "../finance/use-resource";
import { OwnerActions } from "./owner-actions";
import { AccountFacts } from "./account-facts";

export function AccountDetailScreen({
  accountId,
}: {
  accountId: string;
}): React.JSX.Element {
  const finance = useNativeFinance();
  const result = useFinanceResource(
    {
      kind: "account",
      householdId:
        finance.authority?.householdId ??
        "00000000-0000-4000-8000-000000000000",
      id: accountId,
    },
    (scope, signal) => {
      if (scope.selector.kind !== "account")
        throw new Error("Expected account scope.");
      return finance.accounts.read(
        scope.householdId,
        scope.selector.id,
        signal,
      );
    },
  );
  return (
    <Screen>
      <Panel>
        {result.kind === "ready" ? (
          <>
            <AppText variant="heading" accessibilityRole="header">
              {result.value.label}
            </AppText>
            <AccountFacts account={result.value} />
            <OwnerActions account={result.value} />
            {result.value.access === "TOTALS" && (
              <AppText>
                Only account values are shared with you. Transaction details are
                not shared.
              </AppText>
            )}
          </>
        ) : result.kind === "loading" ? (
          <AppText accessibilityLiveRegion="polite">Loading account…</AppText>
        ) : (
          <>
            <AppText accessibilityLiveRegion="polite">{result.message}</AppText>
            <NativeActions>
              <NativeAction label="Retry account" onPress={result.retry} />
            </NativeActions>
          </>
        )}
      </Panel>
    </Screen>
  );
}
