import { expect, it } from "vitest";
import {
  goalWriteSchema,
  goalPageQuerySchema,
  goalListQuerySchema,
} from "../packages/contracts/src/goal-lifecycle.js";
const input = {
  name: "Shared holiday",
  status: "ACTIVE",
  beneficiary: "ADULT",
  priority: 1,
  target: { amountMinor: "9223372036854775807", currency: "GBP" },
  targetDate: "2028-02-29",
};
it("accepts exact adult goal metadata and rejects private funding fields", () => {
  expect(goalWriteSchema.parse(input)).toEqual(input);
  for (const bad of [
    { ...input, name: " " },
    { ...input, name: "bad\u0000name" },
    { ...input, priority: 0 },
    { ...input, targetDate: "2027-02-29" },
    { ...input, beneficiary: "CHILD" },
    { ...input, accountId: "private" },
    { ...input, allocations: [] },
    {
      ...input,
      target: { amountMinor: "9223372036854775808", currency: "GBP" },
    },
    { ...input, target: { amountMinor: "-1", currency: "GBP" } },
    { ...input, target: { amountMinor: "1", currency: "USD" } },
  ])
    expect(goalWriteSchema.safeParse(bad).success).toBe(false);
});
it("accepts only canonical bounded history and list cursors", () => {
  expect(goalPageQuerySchema.parse({})).toEqual({ afterVersion: 0 });
  expect(goalPageQuerySchema.parse({ afterVersion: "50" })).toEqual({
    afterVersion: 50,
  });
  for (const value of ["01", "-1", "1.0", "2147483648", ["1"]])
    expect(goalPageQuerySchema.safeParse({ afterVersion: value }).success).toBe(
      false,
    );
  expect(goalListQuerySchema.parse({})).toEqual({});
  expect(goalListQuerySchema.safeParse({ householdId: "secret" }).success).toBe(
    false,
  );
});
