import { existsSync } from "node:fs";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import * as contracts from "../packages/contracts/src/index.js";
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
  typeof import("../apps/mobile/src/features/activity/annotation-input.js");
type Intent =
  typeof import("../apps/mobile/src/features/activity/annotation-intent.js");
const inputPath = "apps/mobile/src/features/activity/annotation-input.ts";
const intentPath = "apps/mobile/src/features/activity/annotation-intent.ts";
function input(): Input {
  expect(existsSync(inputPath), "annotation input exists").toBe(true);
  return sourceExports(inputPath, {
    "@joint/contracts": contracts,
  }) as Input;
}
function intent(): Intent {
  expect(existsSync(intentPath), "annotation intent exists").toBe(true);
  return sourceExports(intentPath, {
    "@joint/contracts": contracts,
    "../finance/result": result,
    "../finance/errors": errors,
    "../accounts/write-intent": sourceExports(
      "apps/mobile/src/features/accounts/write-intent.ts",
      {
        "@joint/contracts": contracts,
        "../finance/result": result,
        "../finance/errors": errors,
      },
    ),
    "./annotation-input": input(),
  }) as Intent;
}
const base: contracts.TransactionResponse = {
  id: "11111111-1111-4111-8111-111111111111",
  accountId: "e237d3d7-236f-4ec3-8454-c4e5504d397f",
  bookedDate: "2026-11-04",
  money: { amountMinor: "-125", currency: "GBP" },
  description: "Synthetic coffee",
  source: "MANUAL",
  version: 3,
  createdAt: "2026-11-04T10:00:00.000Z",
  category: "Food",
  classificationKind: "EXPENSE",
  effectiveKind: "EXPENSE",
  classificationConfirmed: true,
  splits: [],
  transfer: null,
  merchant: "Cafe",
  note: { body: "Mine", version: 2 },
  permissions: { canCorrect: true, canClassify: true, canNote: true },
};
const same = (tx: contracts.TransactionResponse) => input().annotationDraft(tx);

it("sends only changed fields, clears emptied ones with null and binds the note version", () => {
  const api = input();
  const draft = { ...same(base), category: "  ", merchant: "Corner Cafe" };
  expect(api.annotationInput(base, draft)).toEqual({
    ok: true,
    value: { category: null, merchant: "Corner Cafe" },
  });
  expect(api.annotationInput(base, { ...same(base), note: "Updated" })).toEqual(
    { ok: true, value: { note: "Updated", noteVersion: 2 } },
  );
  expect(api.annotationInput(base, { ...same(base), note: "" })).toEqual({
    ok: true,
    value: { note: null, noteVersion: 2 },
  });
});

it("refuses an unchanged draft and over-long text without calling the server", () => {
  const api = input();
  expect(api.annotationInput(base, same(base))).toMatchObject({ ok: false });
  expect(
    api.annotationInput(base, { ...same(base), merchant: "x".repeat(121) }),
  ).toMatchObject({ ok: false });
});

it("keeps category and kind out of locked rows and honours note and classify permissions", () => {
  const api = input();
  const locked = {
    ...base,
    splits: [] as never[],
    transfer: {
      confirmed: true,
      id: "22222222-2222-4222-8222-222222222222",
      canRemove: true,
    },
  };
  expect(api.annotationFields(locked)).toEqual({
    classification: false,
    merchant: true,
    note: true,
  });
  expect(
    api.annotationInput(locked, { ...same(locked), category: "Other" }),
  ).toMatchObject({ ok: false });
  const viewer = {
    ...base,
    permissions: { canCorrect: false, canClassify: false, canNote: false },
  };
  expect(api.annotationFields(viewer)).toEqual({
    classification: false,
    merchant: false,
    note: false,
  });
  expect(
    api.annotationInput(viewer, { ...same(viewer), merchant: "Other" }),
  ).toMatchObject({ ok: false });
});

it("captures a frozen DTO and the row version so retry reuses identical bytes", async () => {
  const f = await financeFixture();
  const annotate = vi.fn(async () => base);
  const dto = { merchant: "Corner Cafe" };
  const execute = intent().annotationWriteIntent(
    { ...f.finance, transactions: { ...f.finance.transactions, annotate } },
    base,
    dto,
  );
  dto.merchant = "Changed later";
  await execute(new AbortController().signal);
  await execute(new AbortController().signal);
  expect(annotate.mock.calls).toHaveLength(2);
  expect(annotate.mock.calls[1]).toMatchObject([
    f.finance.authority.householdId,
    base.id,
    { merchant: "Corner Cafe" },
    3,
    expect.any(AbortSignal),
  ]);
  f.close();
});

it("treats a response for another row as uncertain and fences lost authority before dispatch", async () => {
  const f = await financeFixture();
  const annotate = vi.fn(async () => ({
    ...base,
    id: "33333333-3333-4333-8333-333333333333",
  }));
  const execute = intent().annotationWriteIntent(
    { ...f.finance, transactions: { ...f.finance.transactions, annotate } },
    base,
    { merchant: "Corner Cafe" },
  );
  await expect(execute(new AbortController().signal)).rejects.toMatchObject({
    outcome: "uncertain",
  });
  f.controller.blockMutations();
  await expect(execute(new AbortController().signal)).rejects.toMatchObject({
    code: "AUTHORITY_CHANGED",
  });
  expect(annotate).toHaveBeenCalledOnce();
  f.close();
});

it("refuses a viewer before dispatch", async () => {
  const f = await financeFixture();
  expect(() =>
    intent().annotationWriteIntent(
      f.finance,
      { ...base, permissions: { ...base.permissions, canClassify: false } },
      { category: "Other" },
    ),
  ).toThrow();
  f.close();
});

it("guides classification refusals to a reload instead of a repeat", () => {
  const locked = new errors.NativeApiError(409, "CLASSIFICATION_LOCKED");
  const invalid = new errors.NativeApiError(400, "INVALID_CLASSIFICATION");
  for (const failure of [locked, invalid]) {
    expect(errors.financeRecovery(failure)).toBe("reload");
    expect(errors.financeErrorMessage(failure)).not.toBe(failure.message);
  }
});
