import type { WealthSummaryDto } from "@joint/contracts";
import { formatAggregateMoney } from "@joint/domain/cash-flow";
import { AppText } from "@/components/app-text";
import { Panel } from "@/components/panel";
import { SummaryCoverage } from "./summary-coverage";
export function SummaryCard({
  summary,
}: {
  summary: WealthSummaryDto;
}): React.JSX.Element {
  if (summary.scope.accountIds.length === 0)
    return (
      <Panel>
        <AppText variant="title" accessibilityRole="header">
          No accounts in this scope
        </AppText>
        <AppText>
          No visible accounts have valuation evidence for this summary.
        </AppText>
        <SummaryCoverage summary={summary} />
      </Panel>
    );
  return (
    <>
      <Panel dark>
        <AppText variant="label" tone="inverse">
          Adult net worth · GBP
        </AppText>
        <AppText
          variant="heading"
          tone="inverse"
          style={{
            fontVariant: ["tabular-nums"],
            fontSize: 36,
            lineHeight: 44,
          }}
        >
          {summary.adultNetWorth
            ? formatAggregateMoney(summary.adultNetWorth)
            : "Unavailable"}
        </AppText>
        <AppText variant="label" tone="inverse">
          Liquid adult assets · GBP
        </AppText>
        <AppText
          variant="title"
          tone="inverse"
          style={{ fontVariant: ["tabular-nums"] }}
        >
          {summary.liquidAdultAssets
            ? formatAggregateMoney(summary.liquidAdultAssets)
            : "Unavailable"}
        </AppText>
      </Panel>
      <Panel>
        <SummaryCoverage summary={summary} />
      </Panel>
    </>
  );
}
