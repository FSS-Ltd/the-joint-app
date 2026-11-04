import { expect, it, vi } from "vitest";
import { createWealthApi } from "../apps/mobile/src/api/wealth.js";
import { createNativeTransport } from "./fixtures/native-api.js";
import { valueAccounts } from "../packages/domain/src/wealth/value-accounts.js";

const householdId = "00000000-0000-4000-8000-000000000001";
const first = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const second = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
function fixture() {
  const summary = valueAccounts({
    householdId,
    grantVersion: 0,
    asOfDate: "2026-11-04",
    calculatedAt: "2026-11-04T12:00:00.000Z",
    accounts: [],
  });
  const token = vi.fn(async () => "token");
  const send = vi.fn<typeof fetch>(async () => Response.json(summary));
  const api = createWealthApi(
    createNativeTransport("https://api.example.test", token, send),
  );
  return { api, token, send, summary, signal: new AbortController().signal };
}
it("reads visible scope without an empty query and canonicalizes selected UUIDs", async () => {
  const { api, send, summary, signal } = fixture();
  expect(await api.read(householdId, undefined, signal)).toEqual(summary);
  expect(
    await api.read(
      householdId,
      [second.toUpperCase(), first.toUpperCase()],
      signal,
    ),
  ).toEqual(summary);
  expect(send.mock.calls.map(([url]) => url)).toEqual([
    `https://api.example.test/v1/households/${householdId}/wealth`,
    `https://api.example.test/v1/households/${householdId}/wealth?accountIds=${first}%2C${second}`,
  ]);
  for (const [, options] of send.mock.calls)
    expect(options).toMatchObject({
      method: "GET",
      credentials: "omit",
      redirect: "error",
      headers: { Authorization: "Bearer token" },
    });
});
it("rejects empty, duplicate, invalid and oversized scopes before credentials", async () => {
  const { api, token, send, signal } = fixture();
  for (const ids of [
    [],
    [first, first.toUpperCase()],
    ["bad"],
    Array.from(
      { length: 51 },
      (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
    ),
  ])
    await expect(
      Promise.resolve().then(() => api.read(householdId, ids, signal)),
    ).rejects.toThrow();
  await expect(
    Promise.resolve().then(() => api.read("bad", undefined, signal)),
  ).rejects.toThrow();
  expect(token).not.toHaveBeenCalled();
  expect(send).not.toHaveBeenCalled();
});
it("validates summary DTOs and keeps server scope rejection authoritative", async () => {
  const { api, send, signal } = fixture();
  send.mockResolvedValueOnce(Response.json({ adultNetWorth: "fabricated" }));
  await expect(api.read(householdId, undefined, signal)).rejects.toMatchObject({
    status: 0,
  });
  send.mockResolvedValueOnce(
    Response.json({ error: { code: "SCOPE_REQUIRED" } }, { status: 400 }),
  );
  await expect(api.read(householdId, undefined, signal)).rejects.toMatchObject({
    status: 400,
    code: "SCOPE_REQUIRED",
  });
  expect(send).toHaveBeenCalledTimes(2);
});
it("fences a pre-aborted read before token acquisition", async () => {
  const { api, token, send } = fixture();
  const abort = new AbortController();
  abort.abort();
  await expect(
    api.read(householdId, undefined, abort.signal),
  ).rejects.toMatchObject({ status: 0 });
  expect(token).not.toHaveBeenCalled();
  expect(send).not.toHaveBeenCalled();
});
