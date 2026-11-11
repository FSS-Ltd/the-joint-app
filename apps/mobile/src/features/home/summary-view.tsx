import type { PropsWithChildren } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { AppText } from "@/components/app-text";
import { Panel } from "@/components/panel";
import { NativeActions } from "@/components/native-actions";
import { NativeAction } from "@/components/native-action";
import { colors, spacing } from "@/theme/tokens";
import { useNativeFinance } from "../finance/context";
import { useFinanceResource } from "../finance/use-resource";
import { SummaryCard } from "./summary-card";
import type { SummaryScope } from "./summary-scope";
export function SummaryView({
  scope: selection,
  onChoose,
  onReset,
  children,
  showCoverage = false,
}: PropsWithChildren<{
  scope: SummaryScope;
  onChoose(): void;
  onReset(): void;
  showCoverage?: boolean;
}>): React.JSX.Element {
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
  const count =
    result.kind === "ready" ? result.value.scope.accountIds.length : null;
  const scopeLabel =
    (selection.kind === "visible"
      ? "All visible accounts"
      : "Selected accounts") +
    (count === null
      ? ""
      : ` · ${count} ${count === 1 ? "account" : "accounts"}`);
  return (
    <>
      <View style={styles.scope}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Choose summary accounts. ${scopeLabel}`}
          onPress={onChoose}
          style={({ pressed }) => [styles.chip, pressed && styles.pressed]}
        >
          <AppText variant="label" tone="inverse">
            {scopeLabel} ⌄
          </AppText>
        </Pressable>
        {selection.kind === "selected" && (
          <NativeActions>
            <NativeAction
              label="Use all visible accounts"
              tone="secondary"
              onPress={onReset}
            />
          </NativeActions>
        )}
      </View>
      {result.kind === "ready" ? (
        <SummaryCard summary={result.value} showCoverage={showCoverage}>
          {children}
        </SummaryCard>
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
          {children}
        </Panel>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  scope: { gap: spacing.small },
  chip: {
    backgroundColor: colors.action,
    borderRadius: 22,
    minHeight: 44,
    justifyContent: "center",
    paddingHorizontal: spacing.medium,
    paddingVertical: spacing.small,
    alignSelf: "flex-start",
    maxWidth: "100%",
  },
  pressed: { backgroundColor: colors.forest },
});
