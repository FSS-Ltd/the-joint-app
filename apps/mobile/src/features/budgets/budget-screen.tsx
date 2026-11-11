import { useState, type ReactNode } from "react";
import type { SpendingReport } from "@joint/contracts";
import { Screen } from "@/components/screen";
import { AppText } from "@/components/app-text";
import { NativeAction } from "@/components/native-action";
import { NativeActions } from "@/components/native-actions";
import { Panel } from "@/components/panel";
import { useNativeFinance } from "../finance/context";
import { financeAuthorityKey } from "../finance/scope";
import type { FinanceResourceSnapshot } from "../finance/state";
import { BudgetEditor } from "./budget-editor";
import { CapList } from "./cap-list";
import {
  currentMobileMonth,
  formatMonthLabel,
  previousMonth,
  nextMonth,
} from "./month-helpers";
import { MonthSelector } from "./month-selector";
import { useCurrentSpendingReport } from "./use-current-spending-report";
import { useSpendingReport } from "./use-spending-report";
import { useRecurringData } from "./use-recurring-data";

export function BudgetScreen(): React.JSX.Element | null {
  const { authority } = useNativeFinance();
  return authority ? (
    <BudgetContent key={financeAuthorityKey(authority)} />
  ) : null;
}

export function BudgetContent(): React.JSX.Element | null {
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null);
  const [editMonth, setEditMonth] = useState<string | null>(null);
  const actions = {
    onMonth: setSelectedMonth,
    onEdit: setEditMonth,
    recurringData: useRecurringData(),
  };
  return (
    <Screen>
      {editMonth ? (
        <EditBudget month={editMonth} onExit={() => setEditMonth(null)} />
      ) : selectedMonth ? (
        <HistoricalBudget month={selectedMonth} {...actions} />
      ) : (
        <CurrentBudget {...actions} />
      )}
    </Screen>
  );
}

type BudgetActions = {
  onMonth(month: string | null): void;
  onEdit(month: string): void;
  recurringData: ReturnType<typeof useRecurringData>;
};

function CurrentBudget(actions: BudgetActions): React.JSX.Element {
  const result = useCurrentSpendingReport();
  return <BudgetMonth result={result} reload={result.retry} {...actions} />;
}

function HistoricalBudget({
  month,
  ...actions
}: BudgetActions & { month: string }): React.JSX.Element {
  const result = useSpendingReport(month);
  return (
    <BudgetMonth
      result={result}
      reload={result.reload}
      selectedMonth={month}
      {...actions}
    />
  );
}

function BudgetMonth({
  result,
  reload,
  selectedMonth,
  onMonth,
  onEdit,
  recurringData,
}: BudgetActions & {
  result: FinanceResourceSnapshot<SpendingReport>;
  reload: () => void;
  selectedMonth?: string;
}): React.JSX.Element {
  const month =
    result.kind === "ready"
      ? result.value.month
      : (selectedMonth ?? currentMobileMonth());

  return (
    <>
      <AppText variant="heading" tone="inverse" accessibilityRole="header">
        Your spending plan
      </AppText>

      <MonthSelector
        month={month}
        onPrevious={() => onMonth(previousMonth(month))}
        onNext={() => {
          const next = nextMonth(month);
          onMonth(next < currentMobileMonth() ? next : null);
        }}
      />
      <AppText tone="inverse">
        Spending from accounts you can view in detail.
      </AppText>

      <BudgetReportState result={result} reload={reload}>
        {(report) => (
          <CapList
            report={report}
            recurringData={recurringData}
            onEdit={() => onEdit(report.month)}
          />
        )}
      </BudgetReportState>
    </>
  );
}

function EditBudget({
  month,
  onExit,
}: {
  month: string;
  onExit: () => void;
}): React.JSX.Element | null {
  const { authority, spending } = useNativeFinance();
  // The editor reads a fixed month so live report updates do not reset its draft.
  const result = useSpendingReport(month);
  if (!authority) return null;

  return (
    <>
      <AppText variant="heading" tone="inverse" accessibilityRole="header">
        Edit category caps
      </AppText>
      <AppText tone="inverse">{formatMonthLabel(month)}</AppText>
      <BudgetReportState result={result} reload={result.reload}>
        {(report) =>
          report.scope.length > 0 ? (
            <BudgetEditor
              key={`${report.month}:${report.scopeKey}:${report.budget?.version ?? 0}`}
              report={report}
              householdId={authority.householdId}
              spending={spending}
              onSaved={onExit}
              onReload={result.reload}
              onBack={onExit}
            />
          ) : (
            <AppText tone="inverse">
              No accounts with transaction access are available.
            </AppText>
          )
        }
      </BudgetReportState>
      {(result.kind !== "ready" || result.value.scope.length === 0) && (
        <NativeActions>
          <NativeAction
            label="Back to spending plan"
            onPress={onExit}
            tone="secondary"
          />
        </NativeActions>
      )}
    </>
  );
}

function BudgetReportState({
  result,
  reload,
  children,
}: {
  result: FinanceResourceSnapshot<SpendingReport>;
  reload: () => void;
  children(report: SpendingReport): ReactNode;
}): ReactNode {
  if (result.kind === "ready") return children(result.value);
  return (
    <Panel>
      <AppText accessibilityLiveRegion="polite" tone="secondary">
        {result.kind === "error" ? result.message : "Loading category caps…"}
      </AppText>
      {result.kind === "error" && (
        <NativeActions>
          <NativeAction label="Try again" onPress={reload} />
        </NativeActions>
      )}
    </Panel>
  );
}
