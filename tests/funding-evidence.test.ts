import { randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import { fundingEvidenceWriteSchema } from "../packages/contracts/src/funding-evidence.js";
const input = {
  valuationId: randomUUID(),
  settledAdultMoney: { amountMinor: "9007199254740993", currency: "GBP" },
  billReserves: { amountMinor: "0", currency: "GBP" },
};
it("preserves exact owner attestations and requires both explicit amounts", () => {
  expect(fundingEvidenceWriteSchema.parse(input)).toEqual(input);
  for (const invalid of [
    { ...input, billReserves: undefined },
    { ...input, billReserves: { amountMinor: "-1", currency: "GBP" } },
    { ...input, settledAdultMoney: { amountMinor: "1", currency: "USD" } },
    {
      ...input,
      settledAdultMoney: {
        amountMinor: "9223372036854775808",
        currency: "GBP",
      },
    },
    { ...input, authorMembershipId: randomUUID() },
  ])
    expect(fundingEvidenceWriteSchema.safeParse(invalid).success).toBe(false);
});
