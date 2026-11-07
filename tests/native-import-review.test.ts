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
  typeof import("../apps/mobile/src/features/imports/review-input.js");
type Intent =
  typeof import("../apps/mobile/src/features/imports/review-intent.js");
const inputPath = "apps/mobile/src/features/imports/review-input.ts";
const intentPath = "apps/mobile/src/features/imports/review-intent.ts";
function input(): Input {
  expect(existsSync(inputPath), "review input exists").toBe(true);
  return sourceExports(inputPath, { "@joint/contracts": contracts }) as Input;
}
function intent(): Intent {
  expect(existsSync(intentPath), "review intent exists").toBe(true);
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
    "./review-input": input(),
  }) as Intent;
}
const key = "99999999-9999-4999-8999-999999999999";
const batch: contracts.ImportBatchResponse = {
  id: "11111111-1111-4111-8111-111111111111",
  accountId: "e237d3d7-236f-4ec3-8454-c4e5504d397f",
  state: "READY",
  version: 5,
  totalRows: 12,
  processedRows: 12,
  validRows: 10,
  rejectedRows: 0,
  overlapRows: 0,
  duplicateRows: 0,
  committedRows: 0,
  skippedRows: 0,
  failureCode: null,
  createdAt: "2026-11-04T10:00:00.000Z",
  committedAt: null,
  rolledBackAt: null,
  originalExpiresAt: null,
  originalAvailable: true,
  permissions: {
    canCommit: true,
    canRollback: false,
    canRestore: false,
    canDeleteOriginal: true,
  },
};

it("offers decisions and commit only for a READY batch the caller may commit", () => {
  const api = input();
  expect(api.importDecidable(batch)).toBe(true);
  for (const state of [
    "QUEUED",
    "PREVIEWING",
    "COMMITTING",
    "COMMITTED",
    "ROLLED_BACK",
    "FAILED",
    "EXPIRED",
  ] as const)
    expect(api.importDecidable({ ...batch, state }), state).toBe(false);
  expect(
    api.importDecidable({
      ...batch,
      permissions: { ...batch.permissions, canCommit: false },
    }),
  ).toBe(false);
});

it("turns chosen rows into bounded decisions and refuses none or too many", () => {
  const api = input();
  expect(api.reviewInput(batch, { choices: { 3: "KEEP", 9: "SKIP" } })).toEqual(
    {
      ok: true,
      value: {
        decisions: [
          { rowNumber: 3, decision: "KEEP" },
          { rowNumber: 9, decision: "SKIP" },
        ],
      },
    },
  );
  expect(api.reviewInput(batch, { choices: {} })).toMatchObject({ ok: false });
  const many = Object.fromEntries(
    Array.from({ length: 101 }, (_, i) => [i + 1, "KEEP" as const]),
  );
  expect(api.reviewInput(batch, { choices: many })).toMatchObject({
    ok: false,
  });
  expect(
    api.reviewInput(
      { ...batch, state: "COMMITTED" },
      { choices: { 1: "KEEP" } },
    ),
  ).toMatchObject({ ok: false });
});

it("commits only when every overlap is decided and rejected rows are acknowledged", () => {
  const api = input();
  expect(api.commitInput(batch, { acknowledged: false })).toEqual({
    ok: true,
    value: { acceptRejectedRows: false },
  });
  expect(
    api.commitInput({ ...batch, overlapRows: 2 }, { acknowledged: true }),
  ).toMatchObject({ ok: false });
  const rejected = { ...batch, rejectedRows: 3 };
  expect(api.commitInput(rejected, { acknowledged: false })).toMatchObject({
    ok: false,
  });
  expect(api.commitInput(rejected, { acknowledged: true })).toEqual({
    ok: true,
    value: { acceptRejectedRows: true },
  });
  expect(
    api.commitInput({ ...batch, validRows: 0 }, { acknowledged: false }),
  ).toMatchObject({ ok: false });
  expect(
    api.commitInput({ ...batch, state: "COMMITTING" }, { acknowledged: false }),
  ).toMatchObject({ ok: false });
});

it("freezes the decisions and batch version so a retry replays identical bytes", async () => {
  const f = await financeFixture();
  const review = vi.fn<(...args: unknown[]) => Promise<unknown>>(
    async () => batch,
  );
  const dto = { decisions: [{ rowNumber: 3, decision: "KEEP" as const }] };
  const execute = intent().reviewIntent(
    { ...f.finance, imports: { ...f.finance.imports, review } as never },
    batch,
    dto,
  );
  dto.decisions[0]!.decision = "SKIP" as never;
  dto.decisions.push({ rowNumber: 4, decision: "KEEP" });
  await execute(new AbortController().signal);
  await execute(new AbortController().signal);
  expect(review.mock.calls[1]).toMatchObject([
    f.finance.authority.householdId,
    batch.id,
    { decisions: [{ rowNumber: 3, decision: "KEEP" }] },
    5,
    expect.any(AbortSignal),
  ]);
  expect(review.mock.calls[1]?.[2]).toEqual(review.mock.calls[0]?.[2]);
  f.close();
});

it("commits with one captured key, body and version, returning the batch", async () => {
  const f = await financeFixture();
  const commit = vi.fn<(...args: unknown[]) => Promise<unknown>>(async () => ({
    batch,
    jobId: key,
  }));
  const execute = intent().commitIntent(
    { ...f.finance, imports: { ...f.finance.imports, commit } as never },
    batch,
    { acceptRejectedRows: false },
    key,
  );
  await execute(new AbortController().signal);
  await execute(new AbortController().signal);
  expect(commit.mock.calls).toHaveLength(2);
  expect(commit.mock.calls[1]).toMatchObject([
    f.finance.authority.householdId,
    batch.id,
    { acceptRejectedRows: false },
    key,
    5,
    expect.any(AbortSignal),
  ]);
  f.close();
});

it("treats another batch in the response as uncertain and fences lost authority before dispatch", async () => {
  const f = await financeFixture();
  const review = vi.fn(async () => ({
    ...batch,
    id: "22222222-2222-4222-8222-222222222222",
  }));
  const execute = intent().reviewIntent(
    { ...f.finance, imports: { ...f.finance.imports, review } as never },
    batch,
    { decisions: [{ rowNumber: 3, decision: "KEEP" }] },
  );
  await expect(execute(new AbortController().signal)).rejects.toMatchObject({
    outcome: "uncertain",
  });
  f.controller.blockMutations();
  await expect(execute(new AbortController().signal)).rejects.toMatchObject({
    code: "AUTHORITY_CHANGED",
  });
  expect(review).toHaveBeenCalledOnce();
  f.close();
});

it("refuses a non-decidable batch before dispatch", async () => {
  const f = await financeFixture();
  const api = intent();
  const done = { ...batch, state: "COMMITTED" as const };
  expect(() =>
    api.reviewIntent(f.finance, done, {
      decisions: [{ rowNumber: 1, decision: "KEEP" }],
    }),
  ).toThrow();
  expect(() =>
    api.commitIntent(f.finance, done, { acceptRejectedRows: false }, key),
  ).toThrow();
  f.close();
});

it("guides import conflicts to the right recovery with plain messages", () => {
  for (const code of [
    "IMPORT_REVIEW_REQUIRED",
    "IMPORT_REJECTS_UNCONFIRMED",
    "IMPORT_NOT_READY",
    "IMPORT_EXPIRED",
    "PREVIEW_STALE",
  ]) {
    const failure = new errors.NativeApiError(409, code);
    expect(errors.financeRecovery(failure), code).toBe("reload");
    expect(errors.financeErrorMessage(failure), code).not.toBe(failure.message);
  }
  const busy = new errors.NativeApiError(409, "IMPORT_BUSY");
  expect(errors.financeRecovery(busy)).toBe("retry");
  expect(errors.financeErrorMessage(busy)).not.toBe(busy.message);
});
