import { expect, it } from "vitest";
import { exportScopeSchema } from "../packages/contracts/src/exports.js";
import { randomUUID } from "node:crypto";

it("requires an explicit bounded unique scope without unknown fields", () => {
  const id = randomUUID();
  expect(exportScopeSchema.safeParse({ accountIds: [id] }).success).toBe(true);
  for (const value of [
    {},
    { accountIds: [] },
    { accountIds: [id, id] },
    { accountIds: Array.from({ length: 51 }, () => randomUUID()) },
    { accountIds: [id], householdId: randomUUID() },
  ])
    expect(exportScopeSchema.safeParse(value).success).toBe(false);
});
