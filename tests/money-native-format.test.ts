import { expect, it } from "vitest";
import { formatMoney } from "../packages/domain/src/index.js";
import {
  formatAggregateMoney,
  formatGbpMinor,
} from "../packages/domain/src/cash-flow.js";

it("formats exact GBP when the runtime's Intl rejects BigInt", () => {
  const numericFormat = new Intl.NumberFormat("en-GB").format;
  const descriptor = Object.getOwnPropertyDescriptor(
    Intl.NumberFormat.prototype,
    "format",
  );
  if (!descriptor) throw Error("Expected Intl format accessor");
  Object.defineProperty(Intl.NumberFormat.prototype, "format", {
    configurable: true,
    get: () => (value: number | bigint) => {
      if (typeof value === "bigint")
        throw new TypeError("Cannot convert BigInt to number");
      return numericFormat(value);
    },
  });
  try {
    const examples = [
      ["0", "£0.00"],
      ["1", "£0.01"],
      ["-125", "-£1.25"],
      ["123456", "£1,234.56"],
      ["900719925474099301", "£9,007,199,254,740,993.01"],
      ["9223372036854775807", "£92,233,720,368,547,758.07"],
      ["-9223372036854775808", "-£92,233,720,368,547,758.08"],
    ] as const;
    for (const [amountMinor, expected] of examples) {
      expect(formatMoney({ amountMinor, currency: "GBP" })).toBe(expected);
      expect(formatAggregateMoney({ amountMinor, currency: "GBP" })).toBe(
        expected,
      );
      expect(formatGbpMinor(BigInt(amountMinor))).toBe(expected);
    }
    expect(
      formatAggregateMoney({ amountMinor: "9".repeat(40), currency: "GBP" }),
    ).toBe("£99,999,999,999,999,999,999,999,999,999,999,999,999.99");
    expect(formatGbpMinor(10n ** 40n)).toBe(
      "£100,000,000,000,000,000,000,000,000,000,000,000,000.00",
    );
    expect(() =>
      formatMoney({ amountMinor: "9223372036854775808", currency: "GBP" }),
    ).toThrow();
    expect(() =>
      formatAggregateMoney({
        amountMinor: "1" + "0".repeat(40),
        currency: "GBP",
      }),
    ).toThrow();
  } finally {
    Object.defineProperty(Intl.NumberFormat.prototype, "format", descriptor);
  }
});
