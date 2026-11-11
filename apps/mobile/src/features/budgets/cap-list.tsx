import { useRouter } from "expo-router";
import type { SpendingReport } from "@joint/contracts";
import { AppText } from "@/components/app-text";
import { NativeAction } from "@/components/native-action";
import { NativeActions } from "@/components/native-actions";
import { Panel } from "@/components/panel";
import { CapCard } from "./cap-card";
import { SavingsImpactCard } from "./savings-impact-card";
import { RecurringCard } from "./recurring-card";
import { BaselinesCard } from "./baselines-card";
import { categorySpending } from "./cap-math";
import type { useRecurringData } from "./use-recurring-data";

export function CapList({
  report,
  onEdit,
  recurringData,
}: {
  report: SpendingReport;
  onEdit: () => void;
  recurringData: ReturnType<typeof useRecurringData>;
}): React.JSX.Element {
  const router = useRouter();
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
              {count.toLocaleString("en-GB")} recorded spending{" "}
              {count === 1 ? "entry" : "entries"}
            </AppText>
          </CapCard>
        ))
      ) : (
        <Panel>
          <AppText tone="secondary">
            Add a category cap to track this month’s spending.
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

      <NativeActions>
        <NativeAction label="Edit category caps" onPress={onEdit} />
      </NativeActions>

      {recurringData.recurring && (
        <RecurringCard candidates={recurringData.recurring.candidates} />
      )}

      {recurringData.baselines && (
        <BaselinesCard report={recurringData.baselines} />
      )}
    </>
  );
}
