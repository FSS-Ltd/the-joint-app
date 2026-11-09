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
import { BudgetEditor } from "./budget-editor";
import { categoryActual } from "./cap-math";
import { currentMobileMonth, previousMonth, nextMonth } from "./month-helpers";
import { MonthSelector } from "./month-selector";
import { useSpendingReport } from "./use-spending-report";

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
  const lines = report.budget?.lines ?? [];

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
      {lines.length > 0 ? (
        lines.map((line) => (
          <CapCard
            key={line.category ?? "uncategorized"}
            line={line}
            actual={categoryActual(report, line.category)}
          />
        ))
      ) : (
        <Panel>
          <AppText tone="secondary">
            No budget caps set for this month. Add limits below to track your
            spending against targets.
          </AppText>
        </Panel>
      )}

      <Panel>
        <AppText variant="label" tone="secondary">
          {report.coverage.closedPeriod
            ? "Anything left this month?"
            : "A thought for month end"}
        </AppText>
        <AppText variant="title">Review the month before reallocating</AppText>
        <AppText tone="secondary">
          An unused cap shows you stayed beneath that limit. It is not proof of
          available cash until month-end coverage and transfers are reviewed.
        </AppText>
        <NativeActions>
          <NativeAction
            label="Review this month"
            tone="secondary"
            onPress={() => router.push("/review")}
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
  const [month, setMonth] = useState(currentMobileMonth);
  const result = useSpendingReport(month);

  if (!authority) return null;

  return (
    <Screen>
      <AppText variant="heading" tone="inverse" accessibilityRole="header">
        Budget caps
      </AppText>

      <MonthSelector
        month={month}
        onPrevious={() => setMonth((m) => previousMonth(m))}
        onNext={() => setMonth((m) => nextMonth(m))}
      />

      {result.kind === "loading" && (
        <Panel>
          <AppText accessibilityLiveRegion="polite" tone="secondary">
            Loading…
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
