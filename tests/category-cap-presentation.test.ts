import { describe, expect, it } from "vitest";
import {
  formatGbpMinor,
  formatAggregateMoney,
} from "../packages/domain/src/cash-flow.js";
import { capPosition } from "../apps/web/components/spending/budget-presentation.js";

describe("exact category cap presentation", () => {
  it.each([
    ["5000", "3200", "1800", "remaining", 64],
    ["5000", "5000", "0", "reached", 100],
    ["5000", "5800", "-800", "over", 100],
    ["0", "0", "0", "reached", 0],
    ["0", "800", "-800", "over", 100],
    ["5000", "-800", "5800", "remaining", 0],
  ] as const)(
    "cap %s and actual %s retain %s minor units",
    (limit, actual, remaining, status, used) => {
      expect(capPosition(limit, actual)).toMatchObject({
        remainingMinor: remaining,
        status,
        usedPercent: used,
      });
    },
  );
  it("preserves amounts beyond Number precision", () => {
    expect(
      capPosition("9223372036854775807", "9223372036854775808"),
    ).toMatchObject({ remainingMinor: "-1", status: "over" });
  });
  it("bounds visual dimensions without counting overspend twice", () => {
    const result = capPosition("5000", "5800");
    expect(result.withinPercent).toBeGreaterThan(86);
    expect(result.withinPercent + result.overPercent).toBe(100);
    expect(capPosition("5000", "-800")).toMatchObject({
      withinPercent: 0,
      overPercent: 0,
    });
    expect(capPosition("0", "800")).toMatchObject({
      withinPercent: 0,
      overPercent: 100,
    });
  });
});

describe("computed GBP display", () => {
  it("formats a computed allowance outside bounded wire-money input", () => {
    expect(formatGbpMinor(10000000000000000000000000000000000004999n)).toBe(
      "£100,000,000,000,000,000,000,000,000,000,000,000,049.99",
    );
    expect(formatGbpMinor(-801n)).toBe("-£8.01");
  });
  it("retains validation for external report money", () => {
    expect(() =>
      formatAggregateMoney({
        amountMinor: "1" + "0".repeat(40),
        currency: "GBP",
      }),
    ).toThrow();
  });
});
