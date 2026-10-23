import { moneySchema, type Money } from "@joint/contracts";

/** Exact GBP boundary conversion: no floating point, rounding or locale guessing. */
export function parseMoneyInput(input: string): Money {
  const match = /^(-?)(\d{1,17})(?:\.(\d{1,2}))?$/.exec(input.trim());
  if (!match?.[2])
    throw new Error("Enter a valid amount with at most two decimal places.");
  const magnitude =
    BigInt(match[2]) * 100n + BigInt((match[3] ?? "").padEnd(2, "0"));
  const amount = match[1] === "-" ? -magnitude : magnitude;
  const result = moneySchema.safeParse({
    amountMinor: amount.toString(),
    currency: "GBP",
  });
  if (!result.success)
    throw new Error("Amount is outside the supported range.");
  return result.data;
}
export function formatMoney(money: Money): string {
  const value = BigInt(moneySchema.parse(money).amountMinor);
  const absolute = value < 0n ? -value : value;
  return `${value < 0n ? "-" : ""}£${new Intl.NumberFormat("en-GB").format(absolute / 100n)}.${(absolute % 100n).toString().padStart(2, "0")}`;
}
export function isLiabilityKind(kind: string): boolean {
  return ["CREDIT_CARD", "LOAN", "MORTGAGE", "OTHER_LIABILITY"].includes(kind);
}
