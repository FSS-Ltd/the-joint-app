import { bookedDateSchema, type AccountResponse } from "@joint/contracts";
import { valuationInput } from "../accounts/write-input";

export function openingBalanceInput(
  account: AccountResponse,
  amount: string,
  date: string,
) {
  if (!bookedDateSchema.safeParse(date).success || date === "0001-01-01")
    return {
      ok: false as const,
      message: "Enter a valid opening date in YYYY-MM-DD format.",
    };
  const previous = new Date(Date.parse(`${date}T00:00:00Z`) - 86_400_000)
    .toISOString()
    .slice(0, 10);
  return valuationInput(account, {
    amount,
    date: previous,
    attested: false,
    adultAmount: "",
  });
}
