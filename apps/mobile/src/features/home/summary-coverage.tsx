import type { WealthSummaryDto } from "@joint/contracts";
import { AppText } from "@/components/app-text";
import { displayDate } from "../accounts/account-labels";
const exclusions = {
  NO_ACCOUNTS: "No accounts",
  MISSING_VALUATION: "Missing valuation",
  STALE_VALUATION: "Stale valuation",
  UNSUPPORTED_CURRENCY: "Unsupported currency",
  UNKNOWN_ADULT_PORTION: "Adult portion unknown",
  INCOMPLETE_VALUATION: "Incomplete valuation",
  FUTURE_VALUATION: "Future valuation",
  INVALID_VALUATION: "Invalid valuation",
} satisfies Record<WealthSummaryDto["excludedReasons"][number], string>;
export function SummaryCoverage({
  summary,
}: {
  summary: WealthSummaryDto;
}): React.JSX.Element {
  return (
    <>
      <AppText>
        {summary.completeness === "COMPLETE"
          ? "Complete valuation evidence"
          : "Partial valuation evidence"}
      </AppText>
      <AppText>Summary date: {displayDate(summary.asOfDate)}</AppText>
      {summary.excludedReasons.map((reason) => (
        <AppText key={reason}>Excluded: {exclusions[reason]}</AppText>
      ))}
      {summary.valuations.map((valuation) => (
        <AppText key={valuation.accountId} tone="secondary">
          Manual source valuation: {displayDate(valuation.asOfDate)}
        </AppText>
      ))}
      <AppText tone="secondary">Calculated at {summary.calculatedAt}</AppText>
      <AppText tone="secondary">
        Only supported adult portions with complete, current evidence
        contribute. Missing evidence is not zero.
      </AppText>
    </>
  );
}
