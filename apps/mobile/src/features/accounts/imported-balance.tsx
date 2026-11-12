import type { CsvBalance } from "@joint/contracts";
import { formatMoney } from "@joint/domain";
import { AppText } from "@/components/app-text";
import { displayDate } from "./account-labels";

export function ImportedBalance({
  balance,
}: {
  balance?: CsvBalance;
}): React.JSX.Element | null {
  if (!balance || balance.status === "UNSUPPORTED") return null;
  if (balance.status !== "AVAILABLE") {
    const message =
      balance.status === "MISSING_ANCHOR"
        ? "Balance estimate unavailable · starting balance needed."
        : balance.status === "NO_ACTIVITY"
          ? "No recorded activity after the manual valuation."
          : "Balance estimate is outside the supported range.";
    return <AppText tone="secondary">{message}</AppText>;
  }
  return (
    <>
      <AppText variant="title">{formatMoney(balance.money)}</AppText>
      <AppText tone="secondary">
        Balance from recorded activity · through{" "}
        {displayDate(balance.throughDate)} (estimate)
      </AppText>
    </>
  );
}
