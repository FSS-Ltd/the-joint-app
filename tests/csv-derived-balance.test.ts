import { expect, it } from "vitest";
import { csvBalanceListSchema } from "../packages/contracts/src/index.js";

it("validates a separate, explicitly estimated CSV balance without changing manual valuation contracts", () => {
  const available = {
    accountId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    status: "AVAILABLE",
    basis: "MANUAL_PLUS_LEDGER",
    money: { amountMinor: "1234", currency: "GBP" },
    anchorId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    anchorDate: "2026-01-01",
    throughDate: "2026-01-03",
  };
  expect(csvBalanceListSchema.safeParse({ items: [available] }).success).toBe(
    true,
  );
  expect(
    csvBalanceListSchema.safeParse({
      items: [{ ...available, adultMoney: available.money }],
    }).success,
  ).toBe(false);
  expect(
    csvBalanceListSchema.safeParse({
      items: [{ accountId: available.accountId, status: "MISSING_ANCHOR" }],
    }).success,
  ).toBe(true);
});
