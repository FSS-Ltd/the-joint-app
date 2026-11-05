import { expect, it, vi } from "vitest";
import { createAccountsApi } from "../apps/mobile/src/api/accounts.js";
import { createNativeTransport } from "./fixtures/native-api.js";
import type { AccountResponse } from "../packages/contracts/src/index.js";

const householdId = "00000000-0000-4000-8000-000000000001";
const accountId = "00000000-0000-4000-8000-000000000002";
const membershipId = "00000000-0000-4000-8000-000000000003";
const key = "00000000-0000-4000-8000-000000000004";
const input = {
  label: "Everyday",
  kind: "CURRENT",
  currency: "GBP",
  liquidity: "AVAILABLE",
} as const;
const account: AccountResponse = {
  ...input,
  id: accountId,
  householdId,
  legalOwnerKind: "ADULT",
  version: 3,
  source: "MANUAL",
  ownership: "OWNED",
  access: "TRANSACTIONS",
  latestValuation: null,
  sharing: { membershipId, level: "NONE", version: 0 },
  permissions: { canEdit: true, canValue: true, canShare: true },
};
function fixture() {
  const send = vi.fn<typeof fetch>(async () => Response.json(account));
  const token = vi.fn(async () => "token");
  const api = createAccountsApi(
    createNativeTransport("https://api.example.test", token, send),
  );
  return { api, send, token, signal: new AbortController().signal };
}
it("uses canonical account contracts and exact GET/POST/PATCH/PUT headers", async () => {
  const { api, send, signal } = fixture();
  send.mockResolvedValueOnce(
    Response.json({ items: [account], nextCursor: "next" }),
  );
  expect(
    await api.list(householdId, { limit: 2, cursor: "a+b/=" }, signal),
  ).toEqual({ items: [account], nextCursor: "next" });
  expect(await api.read(householdId, accountId, signal)).toEqual(account);
  expect(await api.create(householdId, input, key, signal)).toEqual(account);
  await api.patch(
    householdId,
    accountId,
    { label: "New", liquidity: "LOCKED" },
    3,
    signal,
  );
  await api.setGrant(
    householdId,
    accountId,
    membershipId,
    { level: "TOTALS" },
    0,
    signal,
  );
  const root = `https://api.example.test/v1/households/${householdId}/accounts`;
  expect(send.mock.calls.map(([url]) => url)).toEqual([
    `${root}?limit=2&cursor=a%2Bb%2F%3D`,
    `${root}/${accountId}`,
    root,
    `${root}/${accountId}`,
    `${root}/${accountId}/grants/${membershipId}`,
  ]);
  expect(send.mock.calls.map(([, options]) => options?.method)).toEqual([
    "GET",
    "GET",
    "POST",
    "PATCH",
    "PUT",
  ]);
  for (const [, options] of send.mock.calls)
    expect(options).toMatchObject({
      credentials: "omit",
      redirect: "error",
      headers: { Authorization: "Bearer token", Accept: "application/json" },
    });
  expect(send.mock.calls[2]?.[1]).toMatchObject({
    body: JSON.stringify(input),
    headers: { "Idempotency-Key": key, "Content-Type": "application/json" },
  });
  expect(send.mock.calls[3]?.[1]?.headers).toMatchObject({ "If-Match": '"3"' });
  expect(send.mock.calls[4]?.[1]?.headers).toMatchObject({ "If-Match": '"0"' });
});
it("rejects invalid IDs, input, page bounds, keys and versions before acquiring credentials", async () => {
  const { api, token, send, signal } = fixture();
  const invalid = [
    () => api.read("../bad", accountId, signal),
    () => api.read(householdId, "bad", signal),
    () => api.list(householdId, { limit: 0 }, signal),
    () => api.list(householdId, { limit: 201 }, signal),
    () => api.list(householdId, { cursor: "x".repeat(2049) }, signal),
    () => api.create(householdId, { ...input, label: "" }, key, signal),
    () => api.create(householdId, input, "bad", signal),
    () =>
      api.patch(
        householdId,
        accountId,
        { label: "New", liquidity: "LOCKED" },
        -1,
        signal,
      ),
    () =>
      api.patch(
        householdId,
        accountId,
        { label: "New", liquidity: "LOCKED" },
        2147483648,
        signal,
      ),
    () =>
      api.setGrant(householdId, accountId, "bad", { level: "NONE" }, 0, signal),
  ];
  for (const action of invalid)
    await expect(
      Promise.resolve().then(async () => {
        await action();
      }),
    ).rejects.toThrow();
  expect(send).not.toHaveBeenCalled();
  expect(token).not.toHaveBeenCalled();
});
it("keeps unchanged caller retries identical and never retries an uncertain write automatically", async () => {
  const { api, send, signal } = fixture();
  send.mockRejectedValue(new Error("connection lost after commit"));
  for (let i = 0; i < 2; i++)
    await expect(
      api.create(householdId, input, key, signal),
    ).rejects.toMatchObject({ outcome: "uncertain", status: 0 });
  expect(send).toHaveBeenCalledTimes(2);
  expect(send.mock.calls.map(([, options]) => options?.body)).toEqual([
    JSON.stringify(input),
    JSON.stringify(input),
  ]);
  for (const [, options] of send.mock.calls)
    expect(options?.headers).toMatchObject({ "Idempotency-Key": key });
});
it("keeps stale versions and safe API rejection authoritative without automatic retry", async () => {
  const { api, send, signal } = fixture();
  send.mockImplementation(async () =>
    Response.json(
      { error: { code: "VERSION_CONFLICT", message: "private row content" } },
      { status: 409 },
    ),
  );
  for (let i = 0; i < 2; i++)
    await expect(
      api.patch(
        householdId,
        accountId,
        { label: "New", liquidity: "LOCKED" },
        2,
        signal,
      ),
    ).rejects.toMatchObject({
      status: 409,
      code: "VERSION_CONFLICT",
      outcome: "rejected",
    });
  expect(send).toHaveBeenCalledTimes(2);
  for (const [, options] of send.mock.calls)
    expect(options?.headers).toMatchObject({ "If-Match": '"2"' });
});
it("rejects malformed account DTOs without returning unvalidated financial data", async () => {
  const { api, send, signal } = fixture();
  send.mockImplementation(async () =>
    Response.json({ ...account, version: "3" }),
  );
  await expect(api.read(householdId, accountId, signal)).rejects.toMatchObject({
    status: 0,
  });
  await expect(
    api.create(householdId, input, key, signal),
  ).rejects.toMatchObject({ outcome: "uncertain" });
});

const valuation = {
  money: { amountMinor: "1000000", currency: "GBP" },
  adultMoney: { amountMinor: "700000", currency: "GBP" },
  asOfDate: "2026-11-04",
} as const;
it("posts canonical valuations with the caller's key, account version and abort signal", async () => {
  const { api, send, signal } = fixture();
  expect(
    await api.value(householdId, accountId, valuation, key, 3, signal),
  ).toEqual(account);
  expect(send).toHaveBeenCalledOnce();
  expect(JSON.parse(String(send.mock.calls[0]?.[1]?.body))).toEqual(valuation);
  expect(send.mock.calls[0]?.[0]).toBe(
    `https://api.example.test/v1/households/${householdId}/accounts/${accountId}/valuations`,
  );
  expect(send.mock.calls[0]?.[1]).toMatchObject({
    method: "POST",
    headers: { "Idempotency-Key": key, "If-Match": '"3"' },
  });
});
it("rejects invalid valuations, IDs, keys and versions before credential acquisition", async () => {
  const { api, token, send, signal } = fixture();
  const actions = [
    () => api.value("bad", accountId, valuation, key, 3, signal),
    () => api.value(householdId, "bad", valuation, key, 3, signal),
    () =>
      api.value(
        householdId,
        accountId,
        {
          ...valuation,
          adultMoney: { amountMinor: "1000001", currency: "GBP" },
        },
        key,
        3,
        signal,
      ),
    () =>
      api.value(
        householdId,
        accountId,
        { ...valuation, asOfDate: "2026-02-30" },
        key,
        3,
        signal,
      ),
    () => api.value(householdId, accountId, valuation, "bad", 3, signal),
    () => api.value(householdId, accountId, valuation, key, -1, signal),
    () => api.value(householdId, accountId, valuation, key, 2147483648, signal),
  ];
  for (const action of actions)
    await expect(Promise.resolve().then(action)).rejects.toThrow();
  expect(token).not.toHaveBeenCalled();
  expect(send).not.toHaveBeenCalled();
});
it("preserves valuation retry identity and never replays an uncertain or conflicting valuation", async () => {
  const { api, send, signal } = fixture();
  send.mockRejectedValueOnce(new Error("connection lost after commit"));
  await expect(
    api.value(householdId, accountId, valuation, key, 3, signal),
  ).rejects.toMatchObject({ outcome: "uncertain" });
  expect(send).toHaveBeenCalledOnce();
  send.mockResolvedValueOnce(
    Response.json({ error: { code: "VERSION_CONFLICT" } }, { status: 409 }),
  );
  await expect(
    api.value(householdId, accountId, valuation, key, 3, signal),
  ).rejects.toMatchObject({
    status: 409,
    code: "VERSION_CONFLICT",
    outcome: "rejected",
  });
  expect(send).toHaveBeenCalledTimes(2);
  for (const [, options] of send.mock.calls) {
    expect(options?.body).toBe(send.mock.calls[0]?.[1]?.body);
    expect(JSON.parse(String(options?.body))).toEqual(valuation);
    expect(options?.headers).toMatchObject({
      "Idempotency-Key": key,
      "If-Match": '"3"',
    });
  }
});
