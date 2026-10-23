import { beforeEach, afterEach, expect, it, vi } from "vitest";
import {
  readSpending,
  writeBudget,
  writeCoverage,
  writeSplits,
  confirmTransfer,
  readCategories,
  readBudget,
  readTransfer,
  removeTransfer,
} from "../apps/web/lib/server/spending-routes.js";
const h = "11111111-1111-4111-8111-111111111111",
  a = "22222222-2222-4222-8222-222222222222";
let calls = 0;
function req(body?: object, query = "", headers: Record<string, string> = {}) {
  return new Request(`http://127.0.0.1:3000/api/local${query}`, {
    method: body ? "POST" : "GET",
    headers: {
      Cookie: `joint-session=${"s".repeat(43)}; joint-csrf=${"c".repeat(43)}`,
      Origin: "http://127.0.0.1:3000",
      "X-CSRF-Token": "c".repeat(43),
      "Content-Type": "application/json",
      "If-Match": '"0"',
      "Idempotency-Key": a,
      ...headers,
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}
beforeEach(() => {
  calls = 0;
  vi.stubEnv("WEB_ORIGIN", "http://127.0.0.1:3000");
  vi.stubEnv("API_BASE_URL", "http://127.0.0.1:3001");
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      calls++;
      return Response.json({ private: "sentinel" });
    }),
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
it("rejects unknown or duplicate report filters before forwarding", async () => {
  for (const q of [
    "?month=2026-01&private=true",
    "?month=2026-01&month=2026-02",
    "?month=bad",
    "?month=2026-01&accountIds=bad",
  ]) {
    expect((await readSpending(req(undefined, q), h)).status).toBe(400);
  }
  expect(calls).toBe(0);
});
it("requires CSRF and strict budget payloads", async () => {
  expect(
    (
      await writeBudget(
        req({ accountIds: [a], lines: [] }, "", { "X-CSRF-Token": "wrong" }),
        h,
        "2026-01",
      )
    ).status,
  ).toBe(403);
  expect(
    (
      await writeBudget(
        req({ accountIds: [a], lines: [], private: true }),
        h,
        "2026-01",
      )
    ).status,
  ).toBe(400);
  expect(calls).toBe(0);
});
it("accepts quoted zero coverage version and validates the upstream DTO", async () => {
  const response = await writeCoverage(
    req({ complete: true }),
    h,
    a,
    "2026-01",
  );
  expect(response.status).toBe(503);
  expect(calls).toBe(1);
  expect(await response.text()).not.toContain("sentinel");
});
it("rejects malformed split and transfer inputs", async () => {
  expect(
    (
      await writeSplits(
        req(
          {
            lines: [
              {
                category: null,
                money: { amountMinor: "-1", currency: "GBP" },
                classificationKind: "EXPENSE",
              },
            ],
          },
          "",
          { "If-Match": '"1"' },
        ),
        h,
        a,
      )
    ).status,
  ).toBe(400);
  expect(
    (
      await confirmTransfer(
        req({
          fromTransactionId: a,
          toTransactionId: a,
          fromVersion: 1,
          toVersion: 1,
        }),
        h,
      )
    ).status,
  ).toBe(400);
  expect(calls).toBe(0);
});
it("forwards only validated report queries with session authentication and no cache", async () => {
  const response = {
    month: "2026-01",
    startDate: "2026-01-01",
    endDateExclusive: "2026-02-01",
    scopeKey: "a".repeat(64),
    permissionKey: "b".repeat(64),
    calculatedAt: "2026-10-23T00:00:00.000Z",
    scope: [],
    coverage: {
      complete: false,
      closedPeriod: true,
      reasons: ["NO_ACCOUNTS"],
      missingAccountIds: [],
    },
    summary: null,
    trend: [],
    comparison: null,
    budget: null,
    provenance: {
      source: "CSV_MANUAL",
      latestRecordDate: null,
      sourceRowCount: 0,
    },
  };
  const fetcher = vi.fn(async () => Response.json(response));
  vi.stubGlobal("fetch", fetcher);
  const result = await readSpending(
    req(undefined, `?month=2026-01&accountIds=${a}`),
    h,
  );
  expect(result.status).toBe(200);
  expect(result.headers.get("Cache-Control")).toBe("no-store");
  expect(fetcher).toHaveBeenCalledWith(
    new URL(
      `http://127.0.0.1:3001/v1/households/${h}/reports/spending?month=2026-01&accountIds=${a}`,
    ),
    expect.objectContaining({
      cache: "no-store",
      redirect: "error",
      headers: expect.objectContaining({
        Authorization: `Session ${"s".repeat(43)}`,
      }),
    }),
  );
});
it("accepts budget and coverage DTOs at fixed PUT paths and forwards optimistic versions", async () => {
  const budget = {
    id: a,
    scopeId: a,
    month: "2026-01",
    accountIds: [a],
    currency: "GBP",
    version: 1,
    lines: [
      { category: null, limit: { amountMinor: "20000", currency: "GBP" } },
    ],
    updatedAt: "2026-10-23T00:00:00.000Z",
  };
  const forwarded: { path: string; init: RequestInit }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init: RequestInit) => {
      forwarded.push({ path: String(input), init });
      return Response.json(
        forwarded.length === 1
          ? budget
          : {
              version: 1,
              complete: true,
              reviewedAt: "2026-10-23T00:00:00.000Z",
            },
      );
    }),
  );
  expect(
    (
      await writeBudget(
        req({ accountIds: [a], lines: budget.lines }),
        h,
        "2026-01",
      )
    ).status,
  ).toBe(200);
  expect(
    (await writeCoverage(req({ complete: true }), h, a, "2026-01")).status,
  ).toBe(200);
  expect(forwarded.map((v) => v.path)).toEqual([
    `http://127.0.0.1:3001/v1/households/${h}/budgets/2026-01`,
    `http://127.0.0.1:3001/v1/households/${h}/accounts/${a}/coverage/2026-01`,
  ]);
  for (const item of forwarded) {
    expect(item.init.method).toBe("PUT");
    expect(new Headers(item.init.headers).get("If-Match")).toBe('"0"');
  }
});
it("keeps category labels exact and validates budget month before upstream", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      Response.json({ items: [null, "Groceries", "groceries"] }),
    ),
  );
  expect(
    await (await readCategories(req(undefined, `?accountIds=${a}`), h)).json(),
  ).toEqual({ items: [null, "Groceries", "groceries"] });
  expect((await readBudget(req(), h, "2026-99")).status).toBe(400);
});
it("rejects foreign paths, unknown body fields, duplicate scopes and unsafe versions", async () => {
  for (const version of ["0", '"-1"', '"2147483648"', '"01"'])
    expect(
      (
        await writeCoverage(
          req({ complete: true }, "", { "If-Match": version }),
          h,
          a,
          "2026-01",
        )
      ).status,
    ).toBe(400);
  expect(
    (await writeBudget(req({ accountIds: [a, a], lines: [] }), h, "2026-01"))
      .status,
  ).toBe(400);
  expect(
    (await writeCoverage(req({ complete: true, ownerId: a }), h, a, "2026-01"))
      .status,
  ).toBe(400);
  expect((await readTransfer(req(), h, "../private")).status).toBe(400);
  expect(
    (
      await removeTransfer(
        req({ fromVersion: 1, toVersion: 1, hidden: true }),
        h,
        a,
      )
    ).status,
  ).toBe(400);
  expect(calls).toBe(0);
});
it("preserves version conflicts without leaking upstream details", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      Response.json(
        {
          error: {
            code: "VERSION_CONFLICT",
            message: "database-host private-sentinel",
          },
        },
        { status: 409 },
      ),
    ),
  );
  const response = await writeBudget(
    req({ accountIds: [a], lines: [] }),
    h,
    "2026-01",
  );
  expect(response.status).toBe(409);
  expect(await response.json()).toEqual({
    error: {
      code: "VERSION_CONFLICT",
      message: "This record changed in another tab. Reload it and try again.",
    },
  });
});
