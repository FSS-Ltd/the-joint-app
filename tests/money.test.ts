import { expect, it } from "vitest";
import { moneySchema } from "../packages/contracts/src/accounts.js";
it("rejects invalid minor-unit strings safely and preserves signed 64-bit boundaries", () => {
  for (const amountMinor of [
    "garbage",
    "1.5",
    "01",
    "-0",
    "1e3",
    "9223372036854775808",
    "-9223372036854775809",
  ])
    expect(
      moneySchema.safeParse({ amountMinor, currency: "GBP" }).success,
    ).toBe(false);
  for (const amountMinor of [
    "0",
    "-1",
    "9223372036854775807",
    "-9223372036854775808",
  ])
    expect(
      moneySchema.parse({ amountMinor, currency: "GBP" }).amountMinor,
    ).toBe(amountMinor);
});

it("parses and formats pounds without floating point or losing large values", async () => {
  const { parseMoneyInput, formatMoney } =
    await import("../packages/domain/src/index.js");
  const examples: readonly (readonly [string, string, string])[] = [
    ["0", "0", "£0.00"],
    ["12.3", "1230", "£12.30"],
    ["-0.01", "-1", "-£0.01"],
    [
      "92233720368547758.07",
      "9223372036854775807",
      "£92,233,720,368,547,758.07",
    ],
  ];
  for (const [input, minor, display] of examples) {
    expect(parseMoneyInput(input)).toEqual({
      amountMinor: minor,
      currency: "GBP",
    });
    expect(formatMoney({ amountMinor: minor, currency: "GBP" })).toBe(display);
  }
  for (const input of [
    "",
    "1.005",
    "1e3",
    "1,000.00",
    "NaN",
    "92233720368547758.08",
  ])
    expect(() => parseMoneyInput(input)).toThrow();
});
