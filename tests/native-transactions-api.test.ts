import { expect, it, vi } from "vitest";
import { createTransactionsApi } from "../apps/mobile/src/api/transactions.js";
import { createNativeTransport } from "./fixtures/native-api.js";

const householdId = "00000000-0000-4000-8000-000000000001";
const accountId = "e237d3d7-236f-4ec3-8454-c4e5504d397f";
const transactionId = "11111111-1111-4111-8111-111111111111";
const idempotencyKey = "99999999-9999-4999-8999-999999999999";
const base = `https://api.example.test/v1/households/${householdId}/transactions`;
const transaction = {
  id: transactionId,
  accountId,
  bookedDate: "2026-11-04",
  money: { amountMinor: "-125", currency: "GBP" },
  description: "Synthetic coffee",
  source: "MANUAL" as const,
  version: 3,
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
function fixture() {
  const token = vi.fn(async () => "token");
  const send = vi.fn<typeof fetch>(async () => Response.json(transaction));
  const api = createTransactionsApi(
    createNativeTransport("https://api.example.test", token, send),
  );
  return { api, token, send, signal: new AbortController().signal };
}
it("lists one bounded account page with stable filter encoding", async () => {
  const { api, send, signal } = fixture();
  const page = { items: [transaction], nextCursor: null };
  send.mockResolvedValueOnce(Response.json(page));
  expect(
    await api.list(
      householdId,
      { accountId, month: "2026-11", uncategorized: false },
      signal,
    ),
  ).toEqual(page);
  expect(send.mock.calls[0]?.[0]).toBe(
    `${base}?${new URLSearchParams({
      accountId,
      limit: "50",
      month: "2026-11",
      uncategorized: "false",
    })}`,
  );
  expect(send.mock.calls[0]?.[1]).toMatchObject({
    method: "GET",
    credentials: "omit",
    redirect: "error",
    headers: { Authorization: "Bearer token" },
  });
});
it("reads one transaction and fences every write with key and version", async () => {
  const { api, send, signal } = fixture();
  expect(await api.read(householdId, transactionId, signal)).toEqual(
    transaction,
  );
  expect(
    await api.create(
      householdId,
      {
        accountId,
        bookedDate: "2026-11-04",
        money: { amountMinor: "-125", currency: "GBP" },
        description: "Synthetic coffee",
      },
      idempotencyKey,
      signal,
    ),
  ).toEqual(transaction);
  expect(
    await api.patch(
      householdId,
      transactionId,
      {
        bookedDate: "2026-11-05",
        money: { amountMinor: "-135", currency: "GBP" },
        description: "Synthetic coffee",
      },
      3,
      signal,
    ),
  ).toEqual(transaction);
  expect(
    await api.annotate(
      householdId,
      transactionId,
      { merchant: "Cafe" },
      3,
      signal,
    ),
  ).toEqual(transaction);
  expect(
    await api.replaceSplits(
      householdId,
      transactionId,
      { lines: [] },
      3,
      signal,
    ),
  ).toEqual(transaction);
  expect(send.mock.calls.map(([url]) => url)).toEqual([
    `${base}/${transactionId}`,
    base,
    `${base}/${transactionId}`,
    `${base}/${transactionId}/annotation`,
    `${base}/${transactionId}/splits`,
  ]);
  expect(send.mock.calls.map(([, options]) => options?.method)).toEqual([
    "GET",
    "POST",
    "PATCH",
    "PATCH",
    "PUT",
  ]);
  const posted = send.mock.calls[1]?.[1];
  if (!posted) throw new Error("missing create request");
  expect(posted.headers).toMatchObject({ "Idempotency-Key": idempotencyKey });
  for (const call of send.mock.calls.slice(2))
    expect(call?.[1]?.headers).toMatchObject({ "If-Match": '"3"' });
  expect(JSON.parse(String(posted.body))).toEqual({
    accountId,
    bookedDate: "2026-11-04",
    money: { amountMinor: "-125", currency: "GBP" },
    description: "Synthetic coffee",
  });
});
it("rejects malformed scopes and bodies before credentials", async () => {
  const { api, token, send, signal } = fixture();
  await expect(
    Promise.resolve().then(() => api.list("bad", { accountId }, signal)),
  ).rejects.toThrow();
  await expect(
    Promise.resolve().then(() => api.read(householdId, "bad", signal)),
  ).rejects.toThrow();
  await expect(
    Promise.resolve().then(() =>
      api.create(householdId, { accountId }, "key", signal),
    ),
  ).rejects.toThrow();
  expect(token).not.toHaveBeenCalled();
  expect(send).not.toHaveBeenCalled();
});
