import { bookedDateSchema, moneySchema } from "@joint/contracts";
import type { FundingAccount } from "./funding-types.js";

export function sourceMinor(value: unknown): bigint | null {
  const parsed = moneySchema.safeParse(value);
  return parsed.success ? BigInt(parsed.data.amountMinor) : null;
}
export function assessFundingSource(
  account: FundingAccount,
  today: string,
): { available: bigint } | null {
  if (
    !account.complete ||
    account.liquidity !== "AVAILABLE" ||
    !["CURRENT", "SAVINGS", "INVESTMENT", "OTHER_ASSET"].includes(
      account.kind,
    ) ||
    !bookedDateSchema.safeParse(account.asOfDate).success
  )
    return null;
  const age =
    (Date.parse(`${today}T00:00:00Z`) -
      Date.parse(`${account.asOfDate}T00:00:00Z`)) /
    86400000;
  if (age < 0 || age > 30) return null;
  const original = sourceMinor(account.money),
    adult = sourceMinor(account.adultMoney),
    settled = sourceMinor(account.settledAdultMoney),
    reserves = sourceMinor(account.billReserves);
  if (
    original === null ||
    adult === null ||
    settled === null ||
    reserves === null ||
    settled < 0n ||
    reserves < 0n ||
    settled > (adult > 0n ? adult : 0n) ||
    (original < 0n
      ? adult !== original || !["CURRENT", "SAVINGS"].includes(account.kind)
      : adult < 0n || adult > original)
  )
    return null;
  return { available: settled > reserves ? settled - reserves : 0n };
}
