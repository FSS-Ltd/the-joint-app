import type { PropsWithChildren } from "react";
import type { WealthSummaryDto } from "@joint/contracts";
import { formatAggregateMoney } from "@joint/domain/cash-flow";
import { AppText } from "@/components/app-text";
import { Panel } from "@/components/panel";
import { SummaryCoverage } from "./summary-coverage";
export function SummaryCard({
  summary,
  children,
  showCoverage = false,
}: PropsWithChildren<{
  summary: WealthSummaryDto;
  showCoverage?: boolean;
}>): React.JSX.Element {
  if (summary.scope.accountIds.length === 0)
    return (
      <Panel>
        <AppText variant="title" accessibilityRole="header">
          No accounts in this scope
        </AppText>
        <AppText>
          No visible accounts have valuation evidence for this summary.
        </AppText>
        {showCoverage && <SummaryCoverage summary={summary} />}
        {children}
      </Panel>
    );
  return (
    <>
      <Panel>
        <AppText variant="label">Adult net worth · GBP</AppText>
        <AppText variant="amount">
          {summary.adultNetWorth
            ? formatAggregateMoney(summary.adultNetWorth)
            : "Unavailable"}
        </AppText>
        <AppText tone="secondary" style={{ fontVariant: ["tabular-nums"] }}>
          Liquid adult assets:{" "}
          {summary.liquidAdultAssets
            ? formatAggregateMoney(summary.liquidAdultAssets)
            : "Unavailable"}
          {" · "}
          {summary.completeness === "COMPLETE"
            ? "Complete evidence"
            : "Partial evidence"}
        </AppText>
        {!showCoverage && <SummaryCoverage summary={summary} concise />}
        {children}
      </Panel>
      {showCoverage && (
        <Panel>
          <SummaryCoverage summary={summary} />
        </Panel>
      )}
    </>
  );
}
