import { useState } from "react";
import { StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import type { SpendingReport } from "@joint/contracts";
import { Screen } from "@/components/screen";
import { AppText } from "@/components/app-text";
import { NativeAction } from "@/components/native-action";
import { NativeActions } from "@/components/native-actions";
import { Panel } from "@/components/panel";
import { colors } from "@/theme/tokens";
import { useNativeFinance } from "../finance/context";
import { financeAuthorityKey } from "../finance/scope";
import { CapCard } from "./cap-card";
import { SavingsImpactCard } from "./savings-impact-card";
import { RecurringCard } from "./recurring-card";
import { BaselinesCard } from "./baselines-card";
import { BudgetEditor } from "./budget-editor";
import { categorySpending } from "./cap-math";
import { currentMobileMonth, previousMonth, nextMonth } from "./month-helpers";
import { MonthSelector } from "./month-selector";
import { useSpendingReport } from "./use-spending-report";
import { useRecurringData } from "./use-recurring-data";

export function CapList({
  report,
  householdId,
  onBudgetSaved,
  onReload,
}: {
  report: SpendingReport;
  householdId: string;
  onBudgetSaved: () => void;
  onReload: () => void;
}): React.JSX.Element {
  const router = useRouter();
  const { spending } = useNativeFinance();
  const recurringData = useRecurringData();
  const caps = (report.budget?.lines ?? []).map((line) => ({
    line,
    ...categorySpending(report, line.category),
  }));

  if (report.scope.length === 0) {
    return (
      <Panel>
        <AppText variant="title">Your picture starts with an account</AppText>
        <AppText tone="secondary">
          No accounts with Values and details access are available.
        </AppText>
        <NativeActions>
          <NativeAction
            label="Open accounts"
            onPress={() => router.push("/home/accounts")}
          />
        </NativeActions>
      </Panel>
    );
  }

  return (
    <>
      {caps.length > 0 ? (
        caps.map(({ line, spending: actual, count }) => (
          <CapCard
            key={line.category ?? "uncategorized"}
            line={line}
            actual={actual}
            partialCoverage={!report.coverage.complete}
          >
            <AppText variant="label" tone="secondary">
              {count.toLocaleString("en-GB")} recorded{" "}
              {count === 1 ? "transaction" : "transactions"}
            </AppText>
          </CapCard>
        ))
      ) : (
        <Panel>
          <AppText tone="secondary">
            Add a category cap below to track this month’s spending.
          </AppText>
        </Panel>
      )}

      {caps.length > 0 && (
        <SavingsImpactCard
          capLines={caps.map(({ line, spending }) => ({
            limitMinor: line.limit.amountMinor,
            actualMinor: spending.amountMinor,
          }))}
        />
      )}

      <Panel tint="apricot" compact>
        <AppText variant="title" accessibilityRole="header">
          {report.coverage.closedPeriod
            ? "Review the month"
            : "Month-end review"}
        </AppText>
        <AppText tone="secondary">
          Check coverage and transfers before allocating any remaining cash.
        </AppText>
        <NativeActions>
          <NativeAction
            label="Review this month"
            tone="secondary"
            onPress={() =>
              router.push({
                pathname: "/review",
                params: { month: report.month },
              })
            }
          />
        </NativeActions>
      </Panel>

      <BudgetEditor
        key={`${report.month}:${report.scopeKey}:${report.budget?.version ?? 0}`}
        report={report}
        householdId={householdId}
        spending={spending}
        onSaved={onBudgetSaved}
        onReload={onReload}
      />

      {recurringData.recurring && (
        <RecurringCard candidates={recurringData.recurring.candidates} />
      )}

      {recurringData.baselines && (
        <BaselinesCard report={recurringData.baselines} />
      )}
    </>
  );
}

export function BudgetScreen(): React.JSX.Element | null {
  const { authority } = useNativeFinance();
  return authority ? (
    <BudgetContent key={financeAuthorityKey(authority)} />
  ) : null;
}

export function BudgetContent(): React.JSX.Element | null {
  const { authority } = useNativeFinance();
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null);
  const result = useSpendingReport(selectedMonth ?? "current");
  const month =
    result.kind === "ready"
      ? result.value.month
      : (selectedMonth ?? currentMobileMonth());

  if (!authority) return null;

  return (
    <Screen>
      <AppText variant="heading" tone="inverse" accessibilityRole="header">
        Your spending plan
      </AppText>

      <MonthSelector
        month={month}
        onPrevious={() => setSelectedMonth(previousMonth(month))}
        onNext={() => {
          const next = nextMonth(month);
          setSelectedMonth(next < currentMobileMonth() ? next : null);
        }}
      />
      <AppText tone="inverse">
        Spending from accounts you can view in detail.
      </AppText>

      {result.kind === "loading" && (
        <Panel>
          <AppText accessibilityLiveRegion="polite" tone="secondary">
            Loading category caps…
          </AppText>
        </Panel>
      )}

      {result.kind === "error" && (
        <Panel>
          <AppText accessibilityLiveRegion="polite" style={styles.error}>
            {result.message}
          </AppText>
          <NativeActions>
            <NativeAction label="Try again" onPress={result.reload} />
          </NativeActions>
        </Panel>
      )}

      {result.kind === "ready" && (
        <CapList
          report={result.value}
          householdId={authority.householdId}
          onBudgetSaved={result.reload}
          onReload={result.reload}
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  error: {
    color: colors.error,
  },
});
