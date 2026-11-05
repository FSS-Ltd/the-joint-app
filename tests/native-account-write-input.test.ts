import { expect, it } from "vitest";
import { existsSync } from "node:fs";
import * as contracts from "../packages/contracts/src/index.js";
import * as domain from "../packages/domain/src/index.js";
import { sourceExports } from "./fixtures/native-source-harness.js";
import { account } from "./fixtures/native-read-ui.js";

type Inputs =
  typeof import("../apps/mobile/src/features/accounts/write-input.js");
function inputs(): Inputs {
  const path = "apps/mobile/src/features/accounts/write-input.ts";
  expect(existsSync(path), "account write input implementation exists").toBe(
    true,
  );
  return sourceExports(path, {
    "@joint/contracts": contracts,
    "@joint/domain": domain,
  }) as Inputs;
}
it("captures exact signed asset pennies and omits unknown adult portions", () => {
  const result = inputs().valuationInput(account(), {
    amount: "-12.34",
    date: "2026-11-04",
    attested: false,
    adultAmount: "99",
  });
  expect(result).toEqual({
    ok: true,
    value: {
      money: { amountMinor: "-1234", currency: "GBP" },
      asOfDate: "2026-11-04",
    },
  });
});
it.each([
  { amount: "1.001", date: "2026-11-04", attested: false, adultAmount: "" },
  { amount: "1", date: "2026-02-30", attested: false, adultAmount: "" },
  {
    amount: "92233720368547758.08",
    date: "2026-11-04",
    attested: false,
    adultAmount: "",
  },
  { amount: "-10", date: "2026-11-04", attested: true, adultAmount: "-5" },
  { amount: "10", date: "2026-11-04", attested: true, adultAmount: "11" },
])("rejects invalid amounts, calendar dates or attested portions", (draft) => {
  expect(inputs().valuationInput(account(), draft).ok).toBe(false);
});
it("requires nonnegative debt and the full debt when attested", () => {
  const api = inputs(),
    debt = account({ kind: "LOAN" });
  expect(
    api.valuationInput(debt, {
      amount: "-1",
      date: "2026-11-04",
      attested: false,
      adultAmount: "",
    }).ok,
  ).toBe(false);
  expect(
    api.valuationInput(debt, {
      amount: "10",
      date: "2026-11-04",
      attested: true,
      adultAmount: "9",
    }).ok,
  ).toBe(false);
  expect(
    api.valuationInput(debt, {
      amount: "10",
      date: "2026-11-04",
      attested: true,
      adultAmount: "10",
    }),
  ).toMatchObject({ ok: true, value: { adultMoney: { amountMinor: "1000" } } });
});
it("metadata trims canonical labels and rejects empty or overlong values", () => {
  const api = inputs();
  expect(
    api.metadataInput({ label: "  My account  ", liquidity: "AVAILABLE" }),
  ).toEqual({
    ok: true,
    value: { label: "My account", liquidity: "AVAILABLE" },
  });
  expect(api.metadataInput({ label: " ", liquidity: "AVAILABLE" }).ok).toBe(
    false,
  );
  expect(
    api.metadataInput({ label: "a".repeat(81), liquidity: "AVAILABLE" }).ok,
  ).toBe(false);
});
