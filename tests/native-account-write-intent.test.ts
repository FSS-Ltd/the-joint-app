import { existsSync } from "node:fs";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import * as contracts from "../packages/contracts/src/index.js";
import * as result from "../apps/mobile/src/features/finance/result.js";
import * as errors from "../apps/mobile/src/features/finance/errors.js";
import { financeFixture } from "./fixtures/native-finance.js";
import { account } from "./fixtures/native-read-ui.js";
import { sourceExports } from "./fixtures/native-source-harness.js";
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(0);
});
afterEach(() => vi.useRealTimers());
type Intents =
  typeof import("../apps/mobile/src/features/accounts/write-intent.js");
function intents(): Intents {
  const path = "apps/mobile/src/features/accounts/write-intent.ts";
  expect(existsSync(path), "write intent implementation exists").toBe(true);
  return sourceExports(path, {
    "@joint/contracts": contracts,
    "../finance/result": result,
    "../finance/errors": errors,
  }) as Intents;
}
it("captures a valuation DTO, UUID and account version before retry and verifies response target", async () => {
  const f = await financeFixture();
  const original = account({ householdId: f.finance.authority.householdId });
  const value = vi.fn(async () => original);
  const input = {
    money: { amountMinor: "500", currency: "GBP" as const },
    asOfDate: "2026-11-04",
  };
  const execute = intents().accountWriteIntent(
    { ...f.finance, accounts: { ...f.finance.accounts, value } },
    original,
    { kind: "valuation", input, key: "00000000-0000-4000-8000-000000000009" },
  );
  input.money.amountMinor = "900";
  original.version = 22;
  await execute(new AbortController().signal);
  await execute(new AbortController().signal);
  expect(value.mock.calls).toHaveLength(2);
  expect(value.mock.calls[0]).toMatchObject([
    f.finance.authority.householdId,
    original.id,
    { money: { amountMinor: "500" } },
    "00000000-0000-4000-8000-000000000009",
    1,
    expect.any(AbortSignal),
  ]);
  f.close();
});
it("sharing captures only the grant target/version and refreshes identity before exposing result", async () => {
  const f = await financeFixture();
  const item = account({
    householdId: f.finance.authority.householdId,
    version: 8,
    sharing: {
      membershipId: "00000000-0000-4000-8000-000000000009",
      version: 3,
      level: "NONE",
    },
  });
  const setGrant = vi.fn(async () => item),
    reconcile = vi.fn(async () => {});
  const execute = intents().accountWriteIntent(
    { ...f.finance, reconcile, accounts: { ...f.finance.accounts, setGrant } },
    item,
    { kind: "sharing", input: { level: "TOTALS" } },
  );
  await execute(new AbortController().signal);
  expect(setGrant.mock.calls[0]).toMatchObject([
    item.householdId,
    item.id,
    item.sharing!.membershipId,
    { level: "TOTALS" },
    3,
    expect.any(AbortSignal),
  ]);
  expect(reconcile).toHaveBeenCalledWith(f.finance.authority);
  f.close();
});
it("rejects a viewer or absent sharing target before dispatch", async () => {
  const f = await financeFixture(),
    api = intents();
  expect(() =>
    api.accountWriteIntent(
      f.finance,
      account({
        householdId: f.finance.authority.householdId,
        ownership: "SHARED",
      }),
      { kind: "metadata", input: { label: "x", liquidity: "AVAILABLE" } },
    ),
  ).toThrow();
  expect(() =>
    api.accountWriteIntent(
      f.finance,
      account({ householdId: f.finance.authority.householdId }),
      { kind: "sharing", input: { level: "TOTALS" } },
    ),
  ).toThrow();
  f.close();
});
it("treats mismatched post-dispatch DTOs as uncertain and fences authority loss before dispatch", async () => {
  const f = await financeFixture();
  const item = account({ householdId: f.finance.authority.householdId });
  const patch = vi.fn(async () => ({
    ...item,
    id: "00000000-0000-4000-8000-000000000009",
  }));
  const execute = intents().accountWriteIntent(
    { ...f.finance, accounts: { ...f.finance.accounts, patch } },
    item,
    { kind: "metadata", input: { label: "x", liquidity: "AVAILABLE" } },
  );
  await expect(execute(new AbortController().signal)).rejects.toMatchObject({
    outcome: "uncertain",
  });
  f.controller.blockMutations();
  await expect(execute(new AbortController().signal)).rejects.toMatchObject({
    code: "AUTHORITY_CHANGED",
  });
  expect(patch).toHaveBeenCalledOnce();
  f.close();
});
