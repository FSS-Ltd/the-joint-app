import { describe, expect, it } from "vitest";
import {
  valuationInputSchema,
  valuationSchema,
} from "../packages/contracts/src/index.js";
import { encodeExportRow } from "../apps/worker/src/exports/csv.js";

const money = (amountMinor: string) => ({ amountMinor, currency: "GBP" });
const original = { money: money("1000000"), asOfDate: "2026-10-23" };

describe("owner-attested household adult valuation evidence", () => {
  it("preserves omitted input for historical idempotency and accepts explicit unknown", () => {
    expect(valuationInputSchema.parse(original)).toEqual(original);
    expect(
      valuationInputSchema.parse({ ...original, adultMoney: null }),
    ).toEqual({
      ...original,
      adultMoney: null,
    });
  });

  it("keeps original money while recording the adult portion or known zero", () => {
    const result = valuationInputSchema.parse({
      ...original,
      adultMoney: money("700000"),
    });
    expect(result).toEqual({ ...original, adultMoney: money("700000") });
    expect(
      valuationInputSchema.safeParse({ ...original, adultMoney: money("0") })
        .success,
    ).toBe(true);
    expect(
      valuationInputSchema.safeParse({
        money: money("0"),
        asOfDate: original.asOfDate,
        adultMoney: money("0"),
      }).success,
    ).toBe(true);
  });

  it.each([
    money("1000001"),
    money("-1"),
    { amountMinor: "700000", currency: "USD" },
  ])("rejects an impossible or unsupported adult portion %j", (adultMoney) => {
    expect(
      valuationInputSchema.safeParse({ ...original, adultMoney }).success,
    ).toBe(false);
  });

  it("cannot erase a negative balance through a partial or zero attestation", () => {
    const overdraft = { money: money("-50000"), asOfDate: original.asOfDate };
    expect(
      valuationInputSchema.safeParse({
        ...overdraft,
        adultMoney: money("-50000"),
      }).success,
    ).toBe(true);
    for (const amount of ["0", "-49999", "-50001", "1"])
      expect(
        valuationInputSchema.safeParse({
          ...overdraft,
          adultMoney: money(amount),
        }).success,
      ).toBe(false);
  });

  it("fails safely for malformed original and attested amounts", () => {
    for (const amount of [
      "invalid",
      "1.2",
      "1e3",
      "-0",
      "9223372036854775808",
    ]) {
      expect(() =>
        valuationInputSchema.safeParse({
          ...original,
          adultMoney: money(amount),
        }),
      ).not.toThrow();
      expect(
        valuationInputSchema.safeParse({
          ...original,
          adultMoney: money(amount),
        }).success,
      ).toBe(false);
      expect(() =>
        valuationInputSchema.safeParse({
          ...original,
          money: money(amount),
          adultMoney: money("0"),
        }),
      ).not.toThrow();
      expect(
        valuationInputSchema.safeParse({
          ...original,
          money: money(amount),
          adultMoney: money("0"),
        }).success,
      ).toBe(false);
    }
  });

  it("rejects impossible valuation dates and year zero", () => {
    for (const asOfDate of ["0000-01-01", "2026-02-30"])
      expect(
        valuationInputSchema.safeParse({
          ...original,
          asOfDate,
          adultMoney: money("0"),
        }).success,
      ).toBe(false);
  });

  it("reads historical valuation responses as unknown rather than full adult ownership", () => {
    const response = valuationSchema.parse({
      id: "11111111-1111-4111-8111-111111111111",
      ...original,
      recordedAt: "2026-10-23T10:00:00Z",
      complete: true,
      source: "MANUAL",
    });
    expect(response).toHaveProperty("adultMoney", null);
  });

  it("preserves unknown versus known zero through existing CSV details", () => {
    const unknown = encodeExportRow({
      recordType: "balance",
      accountId: "a",
      recordId: "b",
      details: JSON.stringify({ adultAmountMinor: null }),
    });
    const zero = encodeExportRow({
      recordType: "balance",
      accountId: "a",
      recordId: "b",
      details: JSON.stringify({ adultAmountMinor: "0" }),
    });
    expect(unknown).toContain('""adultAmountMinor"":null');
    expect(zero).toContain('""adultAmountMinor"":""0""');
    expect(unknown).not.toEqual(zero);
  });
});
