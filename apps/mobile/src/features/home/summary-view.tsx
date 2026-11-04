import { AppText } from "@/components/app-text";
import { Panel } from "@/components/panel";
import { NativeActions } from "@/components/native-actions";
import { NativeAction } from "@/components/native-action";
import { useNativeFinance } from "../finance/context";
import { useFinanceResource } from "../finance/use-resource";
import { SummaryCard } from "./summary-card";
import type { SummaryScope } from "./summary-scope";
export function SummaryView({
  scope: selection,
}: {
  scope: SummaryScope;
}): React.JSX.Element {
  const finance = useNativeFinance();
  const result = useFinanceResource(
    {
      kind: "wealth",
      householdId:
        finance.authority?.householdId ??
        "00000000-0000-4000-8000-000000000000",
      ...(selection.kind === "selected"
        ? { accountIds: selection.accountIds.join(",") }
        : {}),
    },
    (scope, signal) => {
      if (scope.selector.kind !== "wealth")
        throw new Error("Expected wealth scope.");
      return finance.wealth.read(
        scope.householdId,
        scope.selector.accountIds?.split(","),
        signal,
      );
    },
  );
  return (
    <>
      <Panel>
        <AppText>
          {selection.kind === "visible"
            ? "All visible accounts"
            : `Explicit selection · ${selection.accountIds.length} accounts`}
        </AppText>
        <AppText tone="secondary">
          {result.kind === "ready"
            ? `${result.value.scope.accountIds.length} accounts included in scope. `
            : ""}
          Summary scope is independent of the account list page.
        </AppText>
      </Panel>
      {result.kind === "ready" ? (
        <SummaryCard summary={result.value} />
      ) : (
        <Panel>
          <AppText accessibilityLiveRegion="polite">
            {result.kind === "loading"
              ? "Loading household summary…"
              : result.message}
          </AppText>
          {result.kind === "error" && (
            <>
              <AppText>
                Choose 1–50 accounts for an explicit summary scope. Households
                with more than 50 visible accounts require a selection.
              </AppText>
              <NativeActions>
                <NativeAction label="Retry summary" onPress={result.retry} />
              </NativeActions>
            </>
          )}
        </Panel>
      )}
    </>
  );
}
