import { type CsvMapping, type Money, moneySchema } from "@joint/contracts";

export function londonToday(): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const part = (name: Intl.DateTimeFormatPartTypes) =>
    parts.find((entry) => entry.type === name)?.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}
export function parseBookedDate(
  input: string,
  format: CsvMapping["dateFormat"],
): string | null {
  const value = input.trim();
  let iso: string;
  if (format === "ISO") {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
    iso = value;
  } else {
    const match = /^(\d{1,2})([/-])(\d{1,2})\2(\d{4})$/.exec(value);
    if (!match?.[1] || !match[3] || !match[4]) return null;
    const day = format === "DMY" ? match[1] : match[3];
    const month = format === "DMY" ? match[3] : match[1];
    iso = `${match[4]}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }
  if (iso.startsWith("0000-")) return null;
  const date = new Date(`${iso}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) &&
    date.toISOString().slice(0, 10) === iso
    ? iso
    : null;
}
export function parseCsvAmount(
  input: string,
  separator: CsvMapping["decimalSeparator"],
): bigint | null {
  const value = input.trim();
  const expression =
    separator === "DOT"
      ? /^[+-]?(?:\d{1,17}|\d{1,3}(?:,\d{3})+)(?:\.\d{1,2})?$/
      : /^[+-]?(?:\d{1,17}|\d{1,3}(?:\.\d{3})+)(?:,\d{1,2})?$/;
  if (!expression.test(value)) return null;
  const normalized =
    separator === "DOT"
      ? value.replace(/,/g, "")
      : value.replace(/\./g, "").replace(",", ".");
  const negative = normalized.startsWith("-");
  const [whole, decimal = ""] = normalized.replace(/^[+-]/, "").split(".");
  if (!whole) return null;
  const magnitude = BigInt(whole) * 100n + BigInt(decimal.padEnd(2, "0"));
  return negative ? -magnitude : magnitude;
}
export function checkedMoney(value: bigint): Money | null {
  const result = moneySchema.safeParse({
    amountMinor: value.toString(),
    currency: "GBP",
  });
  return result.success ? result.data : null;
}
