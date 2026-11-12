import type { AccountResponse, CsvBalance } from "@joint/contracts";
import { formatMoney, isLiabilityKind } from "@joint/domain";
import { AppText } from "@/components/app-text";
import { ImportedBalance } from "./imported-balance";
import {
  displayDate,
  grantLabels,
  kinds,
  liquidityLabels,
  ownerLabel,
} from "./account-labels";

export function AccountFacts({
  account,
  balance,
}: {
  account: AccountResponse;
  balance?: CsvBalance;
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
      <ImportedBalance balance={balance} />
      {valuation ? (
        <>
          <AppText variant={balance?.status === "AVAILABLE" ? "body" : "title"}>
            {formatMoney(valuation.money)}
          </AppText>
          <AppText>
            {balance?.status === "AVAILABLE"
              ? "Recorded manual balance"
              : isLiabilityKind(account.kind)
                ? "Total outstanding debt"
                : "Total account value"}{" "}
            · GBP
          </AppText>
          <AppText>
            {valuation.adultMoney
              ? `${balance?.status === "AVAILABLE" ? "Adult portion of manual valuation ·" : "Adult portion:"} ${formatMoney(valuation.adultMoney)}`
              : balance?.status === "AVAILABLE"
                ? "Adult portion of manual valuation unknown"
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
