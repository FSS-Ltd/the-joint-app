import { existsSync } from "node:fs";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import * as contracts from "../packages/contracts/src/index.js";
import * as domain from "../packages/domain/src/index.js";
import * as cashFlow from "../packages/domain/src/cash-flow.js";
import * as errors from "../apps/mobile/src/features/finance/errors.js";
import * as result from "../apps/mobile/src/features/finance/result.js";
import { financeFixture } from "./fixtures/native-finance.js";
import { sourceExports } from "./fixtures/native-source-harness.js";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(0);
});
afterEach(() => vi.useRealTimers());

type Input =
  typeof import("../apps/mobile/src/features/activity/split-input.js");
type Intent =
  typeof import("../apps/mobile/src/features/activity/split-intent.js");
const inputPath = "apps/mobile/src/features/activity/split-input.ts";
const intentPath = "apps/mobile/src/features/activity/split-intent.ts";
function input(): Input {
  expect(existsSync(inputPath), "split input exists").toBe(true);
  return sourceExports(inputPath, {
    "@joint/contracts": contracts,
    "@joint/domain": domain,
    "@joint/domain/cash-flow": cashFlow,
  }) as Input;
}
function intent(): Intent {
  expect(existsSync(intentPath), "split intent exists").toBe(true);
  return sourceExports(intentPath, {
    "@joint/contracts": contracts,
    "../finance/errors": errors,
    "../accounts/write-intent": sourceExports(
      "apps/mobile/src/features/accounts/write-intent.ts",
      {
        "@joint/contracts": contracts,
        "../finance/result": result,
        "../finance/errors": errors,
      },
    ),
    "./split-input": input(),
  }) as Intent;
}
const base: contracts.TransactionResponse = {
  id: "11111111-1111-4111-8111-111111111111",
  accountId: "e237d3d7-236f-4ec3-8454-c4e5504d397f",
  bookedDate: "2026-11-04",
  money: { amountMinor: "-1000", currency: "GBP" },
  description: "Synthetic shop",
  source: "MANUAL",
  version: 4,
  createdAt: "2026-11-04T10:00:00.000Z",
  category: null,
  classificationKind: "EXPENSE",
  effectiveKind: "EXPENSE",
  classificationConfirmed: false,
  splits: [],
  transfer: null,
  merchant: null,
  note: { body: null, version: 0 },
  permissions: { canCorrect: true, canClassify: true, canNote: true },
};
const line = (amount: string, category = "", kind = "EXPENSE" as const) => ({
  category,
  amount,
  classificationKind: kind,
});

it("allows owners to split an unpaired non-zero row and nobody else", () => {
  const api = input();
  expect(api.splitsAllowed(base)).toBe(true);
  expect(
    api.splitsAllowed({
      ...base,
      permissions: { ...base.permissions, canClassify: false },
    }),
  ).toBe(false);
  expect(
    api.splitsAllowed({
      ...base,
      transfer: { confirmed: true, id: base.id, canRemove: true },
    }),
  ).toBe(false);
  expect(
    api.splitsAllowed({
      ...base,
      money: { amountMinor: "0", currency: "GBP" },
    }),
  ).toBe(false);
});

it("starts from two blank components or the saved components as exact decimals", () => {
  const api = input();
  expect(api.splitsDraft(base).lines).toEqual([
    line("", "", "EXPENSE"),
    line("", "", "EXPENSE"),
  ]);
  const saved = {
    ...base,
    splits: [
      {
        id: "22222222-2222-4222-8222-222222222222",
        position: 0,
        category: "Food",
        money: { amountMinor: "-705", currency: "GBP" as const },
        classificationKind: "EXPENSE" as const,
      },
      {
        id: "33333333-3333-4333-8333-333333333333",
        position: 1,
        category: null,
        money: { amountMinor: "-295", currency: "GBP" as const },
        classificationKind: "EXPENSE" as const,
      },
    ],
  };
  expect(api.splitsDraft(saved).lines).toEqual([
    line("-7.05", "Food"),
    line("-2.95", ""),
  ]);
});

it("builds exact integer money lines that add to the transaction", () => {
  const api = input();
  expect(
    api.splitsInput(base, {
      lines: [line("-7.05", " Food "), line("-2.95")],
    }),
  ).toEqual({
    ok: true,
    value: {
      lines: [
        {
          category: "Food",
          money: { amountMinor: "-705", currency: "GBP" },
          classificationKind: "EXPENSE",
        },
        {
          category: null,
          money: { amountMinor: "-295", currency: "GBP" },
          classificationKind: "EXPENSE",
        },
      ],
    },
  });
});

it("refuses unbalanced, zero, unparsable and out-of-range components without dispatch", () => {
  const api = input();
  const bad = [
    [line("-7.05"), line("-2.94")],
    [line("-10.00"), line("0.00")],
    [line("-5.00"), line("abc")],
    [line("-10.00")],
    Array.from({ length: 21 }, () => line("-0.01")),
  ];
  for (const lines of bad)
    expect(api.splitsInput(base, { lines })).toMatchObject({ ok: false });
});

it("keeps large amounts exact beyond Number precision", () => {
  const api = input();
  const huge = {
    ...base,
    money: { amountMinor: "-9007199254740993", currency: "GBP" as const },
  };
  const out = api.splitsInput(huge, {
    lines: [line("-90071992547409.92"), line("-0.01")],
  });
  expect(out).toMatchObject({ ok: true });
  expect(
    api.splitRemaining(huge, { lines: [line("-90071992547409.92")] }),
  ).toBe("-1");
});

it("reports the remaining minor units and null when an amount cannot be read", () => {
  const api = input();
  expect(api.splitRemaining(base, { lines: [line("-7.05"), line("")] })).toBe(
    "-295",
  );
  expect(api.splitRemaining(base, { lines: [line("x")] })).toBeNull();
});

it("refuses to save an unchanged split so versions are not bumped for nothing", () => {
  const api = input();
  const split = {
    ...base,
    splits: [
      {
        id: "22222222-2222-4222-8222-222222222222",
        position: 0,
        category: "Food",
        money: { amountMinor: "-705", currency: "GBP" as const },
        classificationKind: "EXPENSE" as const,
      },
      {
        id: "33333333-3333-4333-8333-333333333333",
        position: 1,
        category: null,
        money: { amountMinor: "-295", currency: "GBP" as const },
        classificationKind: "EXPENSE" as const,
      },
    ],
  };
  expect(api.splitsInput(split, api.splitsDraft(split))).toMatchObject({
    ok: false,
  });
  const edited = api.splitsDraft(split);
  edited.lines[1] = { ...edited.lines[1]!, category: "Bus" };
  expect(api.splitsInput(split, edited)).toMatchObject({ ok: true });
  expect(api.blankSplitLine(split)).toEqual(line("", "", "EXPENSE"));
});

it("clears only an existing split with an empty line list", () => {
  const api = input();
  expect(api.splitsInput(base, { lines: [] })).toMatchObject({ ok: false });
  const split = {
    ...base,
    splits: [
      {
        id: "22222222-2222-4222-8222-222222222222",
        position: 0,
        category: null,
        money: { amountMinor: "-500", currency: "GBP" as const },
        classificationKind: "EXPENSE" as const,
      },
    ],
  };
  expect(api.splitsInput(split, { lines: [] })).toEqual({
    ok: true,
    value: { lines: [] },
  });
});

it("captures a deeply frozen DTO and the row version so a retry replays identical bytes", async () => {
  const f = await financeFixture();
  const replaceSplits = vi.fn(async () => base);
  const dto = {
    lines: [
      {
        category: "Food",
        money: { amountMinor: "-705", currency: "GBP" as const },
        classificationKind: "EXPENSE" as const,
      },
      {
        category: null,
        money: { amountMinor: "-295", currency: "GBP" as const },
        classificationKind: "EXPENSE" as const,
      },
    ],
  };
  const execute = intent().splitsWriteIntent(
    {
      ...f.finance,
      transactions: { ...f.finance.transactions, replaceSplits },
    },
    base,
    dto,
  );
  dto.lines[0]!.money.amountMinor = "-1";
  dto.lines.pop();
  await execute(new AbortController().signal);
  await execute(new AbortController().signal);
  expect(replaceSplits.mock.calls).toHaveLength(2);
  expect(replaceSplits.mock.calls[1]).toMatchObject([
    f.finance.authority.householdId,
    base.id,
    {
      lines: [
        { money: { amountMinor: "-705" } },
        { money: { amountMinor: "-295" } },
      ],
    },
    4,
    expect.any(AbortSignal),
  ]);
  f.close();
});

it("treats another row in the response as uncertain and fences lost authority before dispatch", async () => {
  const f = await financeFixture();
  const replaceSplits = vi.fn(async () => ({
    ...base,
    id: "44444444-4444-4444-8444-444444444444",
  }));
  const execute = intent().splitsWriteIntent(
    {
      ...f.finance,
      transactions: { ...f.finance.transactions, replaceSplits },
    },
    base,
    { lines: [] },
  );
  await expect(execute(new AbortController().signal)).rejects.toMatchObject({
    outcome: "uncertain",
  });
  f.controller.blockMutations();
  await expect(execute(new AbortController().signal)).rejects.toMatchObject({
    code: "AUTHORITY_CHANGED",
  });
  expect(replaceSplits).toHaveBeenCalledOnce();
  f.close();
});

it("refuses a viewer or paired row before dispatch", async () => {
  const f = await financeFixture();
  const api = intent();
  expect(() =>
    api.splitsWriteIntent(
      f.finance,
      { ...base, permissions: { ...base.permissions, canClassify: false } },
      { lines: [] },
    ),
  ).toThrow();
  expect(() =>
    api.splitsWriteIntent(
      f.finance,
      { ...base, transfer: { confirmed: true, id: base.id, canRemove: true } },
      { lines: [] },
    ),
  ).toThrow();
  f.close();
});

it("guides invalid splits to a reload", () => {
  const invalid = new errors.NativeApiError(400, "INVALID_SPLITS");
  expect(errors.financeRecovery(invalid)).toBe("reload");
  expect(errors.financeErrorMessage(invalid)).not.toBe(invalid.message);
});
