import { existsSync } from "node:fs";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import * as contracts from "../packages/contracts/src/index.js";
import * as errors from "../apps/mobile/src/features/finance/errors.js";
import * as result from "../apps/mobile/src/features/finance/result.js";
import { createTransactionsApi } from "../apps/mobile/src/api/transactions.js";
import { createNativeTransport } from "./fixtures/native-api.js";
import { financeFixture } from "./fixtures/native-finance.js";
import { sourceExports } from "./fixtures/native-source-harness.js";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(0);
});
afterEach(() => vi.useRealTimers());

type Input =
  typeof import("../apps/mobile/src/features/activity/transfer-input.js");
type Intent =
  typeof import("../apps/mobile/src/features/activity/transfer-intent.js");
const inputPath = "apps/mobile/src/features/activity/transfer-input.ts";
const intentPath = "apps/mobile/src/features/activity/transfer-intent.ts";
function input(): Input {
  expect(existsSync(inputPath), "transfer input exists").toBe(true);
  return sourceExports(inputPath, {
    "@joint/contracts": contracts,
  }) as Input;
}
function intent(): Intent {
  expect(existsSync(intentPath), "transfer intent exists").toBe(true);
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
    "./transfer-input": input(),
  }) as Intent;
}
const householdId = "00000000-0000-4000-8000-000000000001";
const key = "99999999-9999-4999-8999-999999999999";
const out: contracts.TransactionResponse = {
  id: "11111111-1111-4111-8111-111111111111",
  accountId: "e237d3d7-236f-4ec3-8454-c4e5504d397f",
  bookedDate: "2026-11-04",
  money: { amountMinor: "-5000", currency: "GBP" },
  description: "Synthetic transfer out",
  source: "MANUAL",
  version: 4,
  createdAt: "2026-11-04T10:00:00.000Z",
  category: null,
  classificationKind: null,
  effectiveKind: null,
  classificationConfirmed: false,
  splits: [],
  transfer: null,
  merchant: null,
  note: { body: null, version: 0 },
  permissions: { canCorrect: true, canClassify: true, canNote: true },
};
const into: contracts.TransactionResponse = {
  ...out,
  id: "22222222-2222-4222-8222-222222222222",
  accountId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  money: { amountMinor: "5000", currency: "GBP" },
  description: "Synthetic transfer in",
  version: 7,
};
const linked = (tx: contracts.TransactionResponse) => ({
  ...tx,
  transfer: {
    confirmed: true,
    id: "33333333-3333-4333-8333-333333333333",
    canRemove: true,
  },
});

it("confirms, reads and removes a pair on the existing transfer routes with caller keys and versions in the body", async () => {
  const send = vi.fn<typeof fetch>(async () =>
    Response.json({
      id: "33333333-3333-4333-8333-333333333333",
      from: out,
      to: into,
    }),
  );
  const api = createTransactionsApi(
    createNativeTransport(
      "https://api.example.test",
      async () => "token",
      send,
    ),
  );
  const signal = new AbortController().signal;
  const base = `https://api.example.test/v1/households/${householdId}/transfers`;
  const confirm = {
    fromTransactionId: out.id,
    toTransactionId: into.id,
    fromVersion: 4,
    toVersion: 7,
  };
  await api.confirmTransfer(householdId, confirm, key, signal);
  expect(send.mock.calls[0]?.[0]).toBe(`${base}/confirm`);
  expect(send.mock.calls[0]?.[1]).toMatchObject({
    method: "POST",
    body: JSON.stringify(confirm),
    headers: { "Idempotency-Key": key },
  });
  const id = "33333333-3333-4333-8333-333333333333";
  await api.readTransfer(householdId, id, signal);
  expect(send.mock.calls[1]?.[0]).toBe(`${base}/${id}`);
  expect(send.mock.calls[1]?.[1]).toMatchObject({ method: "GET" });
  await api.removeTransfer(
    householdId,
    id,
    { fromVersion: 4, toVersion: 7 },
    signal,
  );
  expect(send.mock.calls[2]?.[0]).toBe(`${base}/${id}`);
  expect(send.mock.calls[2]?.[1]).toMatchObject({
    method: "DELETE",
    body: '{"fromVersion":4,"toVersion":7}',
  });
});

it("rejects a malformed pair id or body before any request leaves the device", () => {
  const send = vi.fn<typeof fetch>();
  const api = createTransactionsApi(
    createNativeTransport(
      "https://api.example.test",
      async () => "token",
      send,
    ),
  );
  const signal = new AbortController().signal;
  expect(() =>
    api.removeTransfer(
      householdId,
      "../x",
      { fromVersion: 1, toVersion: 1 },
      signal,
    ),
  ).toThrow();
  expect(() =>
    api.confirmTransfer(
      householdId,
      {
        fromTransactionId: out.id,
        toTransactionId: out.id,
        fromVersion: 1,
        toVersion: 1,
      },
      key,
      signal,
    ),
  ).toThrow();
  expect(send).not.toHaveBeenCalled();
});

it("offers a link only to owners of an unpaired, unsplit, non-zero row", () => {
  const api = input();
  expect(api.transferLinkAllowed(out)).toBe(true);
  expect(
    api.transferLinkAllowed({
      ...out,
      permissions: { ...out.permissions, canClassify: false },
    }),
  ).toBe(false);
  expect(api.transferLinkAllowed(linked(out))).toBe(false);
  expect(
    api.transferLinkAllowed({
      ...out,
      splits: [
        {
          id: "44444444-4444-4444-8444-444444444444",
          position: 0,
          category: null,
          money: out.money,
          classificationKind: "EXPENSE",
        },
      ],
    }),
  ).toBe(false);
  expect(
    api.transferLinkAllowed({
      ...out,
      money: { amountMinor: "0", currency: "GBP" },
    }),
  ).toBe(false);
});

it("offers removal only when the server grants it for a confirmed pair", () => {
  const api = input();
  expect(api.transferRemovable(linked(out))).toBe(true);
  expect(api.transferRemovable(out)).toBe(false);
  expect(
    api.transferRemovable({
      ...out,
      transfer: { confirmed: true, id: null, canRemove: true },
    }),
  ).toBe(false);
  expect(
    api.transferRemovable({
      ...linked(out),
      transfer: {
        confirmed: true,
        id: "33333333-3333-4333-8333-333333333333",
        canRemove: false,
      },
    }),
  ).toBe(false);
});

it("lists only exact opposite, unpaired, unsplit entries from another account as candidates", () => {
  const api = input();
  expect(api.isTransferCandidate(out, into)).toBe(true);
  expect(api.isTransferCandidate(into, out)).toBe(true);
  expect(
    api.isTransferCandidate(out, { ...into, accountId: out.accountId }),
  ).toBe(false);
  expect(
    api.isTransferCandidate(out, {
      ...into,
      money: { amountMinor: "4999", currency: "GBP" },
    }),
  ).toBe(false);
  expect(api.isTransferCandidate(out, linked(into))).toBe(false);
  expect(api.isTransferCandidate(out, out)).toBe(false);
});

it("orders the pair by sign and sends both row versions, whichever row is open", () => {
  const api = input();
  const expected = {
    fromTransactionId: out.id,
    toTransactionId: into.id,
    fromVersion: 4,
    toVersion: 7,
  };
  expect(api.transferConfirmInput(out, into)).toEqual({
    ok: true,
    value: expected,
  });
  expect(api.transferConfirmInput(into, out)).toEqual({
    ok: true,
    value: expected,
  });
  expect(api.transferConfirmInput(out, { ...into, id: out.id })).toMatchObject({
    ok: false,
  });
  expect(api.transferConfirmInput(out, linked(into))).toMatchObject({
    ok: false,
  });
});

it("keeps very large opposite amounts exact beyond Number precision", () => {
  const api = input();
  const big = {
    ...out,
    money: { amountMinor: "-9007199254740993", currency: "GBP" as const },
  };
  const mate = {
    ...into,
    money: { amountMinor: "9007199254740993", currency: "GBP" as const },
  };
  const near = {
    ...into,
    money: { amountMinor: "9007199254740992", currency: "GBP" as const },
  };
  expect(api.isTransferCandidate(big, mate)).toBe(true);
  expect(api.isTransferCandidate(big, near)).toBe(false);
});

it("builds the remove body from the pair only when it matches the open row's version", () => {
  const api = input();
  const pair = {
    id: "33333333-3333-4333-8333-333333333333",
    from: linked(out),
    to: linked(into),
  };
  expect(api.transferRemoveInput(linked(out), pair)).toEqual({
    ok: true,
    value: { fromVersion: 4, toVersion: 7 },
  });
  expect(
    api.transferRemoveInput({ ...linked(out), version: 5 }, pair),
  ).toMatchObject({ ok: false });
  expect(
    api.transferRemoveInput(linked(out), {
      ...pair,
      id: "55555555-5555-4555-8555-555555555555",
    }),
  ).toMatchObject({ ok: false });
});

it("freezes the confirm body, key and row identity so a retry replays identical bytes and returns this row's leg", async () => {
  const f = await financeFixture();
  const confirmTransfer = vi.fn(async () => ({
    id: "33333333-3333-4333-8333-333333333333",
    from: linked(out),
    to: linked(into),
  }));
  const body = {
    fromTransactionId: out.id,
    toTransactionId: into.id,
    fromVersion: 4,
    toVersion: 7,
  };
  const execute = intent().transferConfirmIntent(
    {
      ...f.finance,
      transactions: { ...f.finance.transactions, confirmTransfer },
    },
    into,
    body,
    key,
  );
  body.fromVersion = 99;
  const first = await execute(new AbortController().signal);
  await execute(new AbortController().signal);
  expect(first.id).toBe(into.id);
  expect(confirmTransfer.mock.calls[1]).toMatchObject([
    f.finance.authority.householdId,
    { fromVersion: 4, toVersion: 7 },
    key,
    expect.any(AbortSignal),
  ]);
  f.close();
});

it("treats a response that does not contain this row as uncertain and fences lost authority before dispatch", async () => {
  const f = await financeFixture();
  const confirmTransfer = vi.fn(async () => ({
    id: "33333333-3333-4333-8333-333333333333",
    from: { ...out, id: "66666666-6666-4666-8666-666666666666" },
    to: { ...into, id: "77777777-7777-4777-8777-777777777777" },
  }));
  const execute = intent().transferConfirmIntent(
    {
      ...f.finance,
      transactions: { ...f.finance.transactions, confirmTransfer },
    },
    out,
    {
      fromTransactionId: out.id,
      toTransactionId: into.id,
      fromVersion: 4,
      toVersion: 7,
    },
    key,
  );
  await expect(execute(new AbortController().signal)).rejects.toMatchObject({
    outcome: "uncertain",
  });
  f.controller.blockMutations();
  await expect(execute(new AbortController().signal)).rejects.toMatchObject({
    code: "AUTHORITY_CHANGED",
  });
  expect(confirmTransfer).toHaveBeenCalledOnce();
  f.close();
});

it("removes the captured pair id with captured versions and refuses a viewer or unlinked row", async () => {
  const f = await financeFixture();
  const removeTransfer = vi.fn(async () => ({
    id: "33333333-3333-4333-8333-333333333333",
    from: out,
    to: into,
  }));
  const api = intent();
  const finance = {
    ...f.finance,
    transactions: { ...f.finance.transactions, removeTransfer },
  };
  const execute = api.transferRemoveIntent(finance, linked(out), {
    fromVersion: 4,
    toVersion: 7,
  });
  const leg = await execute(new AbortController().signal);
  expect(leg.id).toBe(out.id);
  expect(removeTransfer.mock.calls[0]).toMatchObject([
    f.finance.authority.householdId,
    "33333333-3333-4333-8333-333333333333",
    { fromVersion: 4, toVersion: 7 },
    expect.any(AbortSignal),
  ]);
  expect(() =>
    api.transferRemoveIntent(finance, out, { fromVersion: 4, toVersion: 7 }),
  ).toThrow();
  expect(() =>
    api.transferConfirmIntent(
      f.finance,
      { ...out, permissions: { ...out.permissions, canClassify: false } },
      {
        fromTransactionId: out.id,
        toTransactionId: into.id,
        fromVersion: 4,
        toVersion: 7,
      },
      key,
    ),
  ).toThrow();
  f.close();
});

it("guides invalid transfers to a reload", () => {
  const invalid = new errors.NativeApiError(400, "INVALID_TRANSFER");
  expect(errors.financeRecovery(invalid)).toBe("reload");
  expect(errors.financeErrorMessage(invalid)).not.toBe(invalid.message);
});
