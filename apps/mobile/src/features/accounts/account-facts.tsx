import type { AccountResponse } from "@joint/contracts";
import { formatMoney, isLiabilityKind } from "@joint/domain";
import { AppText } from "@/components/app-text";
import {
  displayDate,
  grantLabels,
  kinds,
  liquidityLabels,
  ownerLabel,
} from "./account-labels";

export function AccountFacts({
  account,
}: {
  account: AccountResponse;
}): React.JSX.Element {
  const valuation = account.latestValuation;
  return (
    <>
      <AppText>
        {kinds[account.kind]} · {liquidityLabels[account.liquidity]}
      </AppText>
      <AppText>{ownerLabel(account)}</AppText>
      <AppText>
        {account.ownership === "OWNED" && account.sharing
          ? grantLabels[account.sharing.level]
          : grantLabels[account.access]}
      </AppText>
      {valuation ? (
        <>
          <AppText variant="title">{formatMoney(valuation.money)}</AppText>
          <AppText>
            {isLiabilityKind(account.kind)
              ? "Total outstanding debt"
              : "Total account value"}{" "}
            · GBP
          </AppText>
          <AppText>
            {valuation.adultMoney
              ? `Adult portion: ${formatMoney(valuation.adultMoney)}`
              : "Adult portion unknown"}
          </AppText>
          <AppText tone="secondary">
            Manual valuation · {displayDate(valuation.asOfDate)}
          </AppText>
          {!valuation.complete && <AppText>Incomplete valuation</AppText>}
        </>
      ) : (
        <AppText>No valuation recorded</AppText>
      )}
    </>
  );
}
