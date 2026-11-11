import { useRouter } from "expo-router";
import type { ReactNode } from "react";
import { AppText } from "@/components/app-text";
import { NativeAction } from "@/components/native-action";
import { NativeActions } from "@/components/native-actions";
import { Panel } from "@/components/panel";
import { displayDate } from "../accounts/account-labels";
import { CapCard } from "../budgets/cap-card";
import { categoryActual } from "../budgets/cap-math";
import { formatMonthLabel } from "../budgets/month-helpers";
import { useCurrentSpendingReport } from "../budgets/use-current-spending-report";
import type { SummaryScope } from "./summary-scope";

export function HomeInsights({
  scope,
}: {
  scope: SummaryScope;
}): React.JSX.Element {
  const router = useRouter();
  const openCaps = (
    <NativeActions>
      <NativeAction
        label="View budget caps"
        tone="secondary"
        onPress={() => router.push("/budgets")}
      />
    </NativeActions>
  );

  return (
    <>
      {scope.kind === "visible" ? (
        <HomeCapPreview action={openCaps} />
      ) : (
        <Panel tint="apricot">
          <AppText variant="title" accessibilityRole="header">
            Budget caps
          </AppText>
          <AppText tone="secondary">
            Budget caps cover all accounts with transaction access.
          </AppText>
          {openCaps}
        </Panel>
      )}
      <Panel tint="sage" compact>
        <AppText variant="title" accessibilityRole="header">
          Saving plans
        </AppText>
        <AppText tone="secondary">
          See planned contributions and progress for each goal.
        </AppText>
        <NativeActions>
          <NativeAction
            label="View goals"
            tone="secondary"
            onPress={() => router.push("/goals")}
          />
        </NativeActions>
      </Panel>
    </>
  );
}

function HomeCapPreview({ action }: { action: ReactNode }): React.JSX.Element {
  const result = useCurrentSpendingReport();
  const report = result.kind === "ready" ? result.value : null;
  const firstCap = report?.budget?.lines[0];
  const latestRecord = report?.provenance.latestRecordDate;
  const freshness = (
    <AppText tone="secondary">
      {report ? formatMonthLabel(report.month) : ""}
      {latestRecord
        ? ` · Latest transaction: ${displayDate(latestRecord)}`
        : ""}
    </AppText>
  );
  if (report?.summary && report.scope.length > 0 && firstCap)
    return (
      <CapCard
        tint="apricot"
        partialCoverage={!report.coverage.complete}
        line={firstCap}
        actual={categoryActual(report, firstCap.category)}
      >
        {freshness}
        {action}
      </CapCard>
    );
  return (
    <Panel tint="apricot">
      <AppText variant="title" accessibilityRole="header">
        Budget caps
      </AppText>
      {result.kind === "loading" && (
        <AppText accessibilityLiveRegion="polite">
          Loading this month’s caps…
        </AppText>
      )}
      {result.kind === "error" && (
        <>
          <AppText accessibilityLiveRegion="polite">{result.message}</AppText>
          <NativeActions>
            <NativeAction
              label="Retry caps"
              tone="secondary"
              onPress={result.retry}
            />
          </NativeActions>
        </>
      )}
      {report && (
        <AppText tone="secondary">
          {report.scope.length === 0
            ? "No accounts with transaction access."
            : firstCap
              ? "Spending data is unavailable."
              : `No caps set for ${formatMonthLabel(report.month)}.`}
        </AppText>
      )}
      {report && freshness}
      {action}
    </Panel>
  );
}
