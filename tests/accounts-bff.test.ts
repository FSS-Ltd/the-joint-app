import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { accountSchema } from "../packages/contracts/dist/index.js";
import {
  createAccount,
  getAccount,
  grantAccount,
  listAccounts,
  patchAccount,
  valueAccount,
} from "../apps/web/lib/server/account-routes.js";

const householdId = "11111111-1111-4111-8111-111111111111";
const accountId = "22222222-2222-4222-8222-222222222222";
const membershipId = "33333333-3333-4333-8333-333333333333";
const token = "s".repeat(43);
const csrf = "c".repeat(43);
const createBody = {
  label: "Synthetic savings",
  kind: "SAVINGS",
  currency: "GBP",
  liquidity: "AVAILABLE",
};
const account = accountSchema.parse({
  id: accountId,
  householdId,
  label: "Synthetic savings",
  kind: "SAVINGS",
  currency: "GBP",
  liquidity: "AVAILABLE",
  legalOwnerKind: "ADULT",
  source: "MANUAL",
  version: 1,
  ownership: "OWNED",
  access: "TRANSACTIONS",
  latestValuation: null,
  sharing: { membershipId, level: "NONE", version: 0 },
  permissions: { canEdit: true, canValue: true, canShare: true },
});
let value: unknown;
let status: number;
let forwarded: { url: string; init: RequestInit }[];
function request(
  body?: unknown,
  options: {
    origin?: string;
    key?: string;
    version?: string;
    cookie?: string;
    query?: string;
  } = {},
): Request {
  const headers: Record<string, string> = {
    Cookie: options.cookie ?? `joint-session=${token}; joint-csrf=${csrf}`,
  };
  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    headers.Origin = options.origin ?? "http://127.0.0.1:3000";
    headers["X-CSRF-Token"] = csrf;
  }
  if (options.key) headers["Idempotency-Key"] = options.key;
  if (options.version) headers["If-Match"] = options.version;
  return new Request(
    `http://127.0.0.1:3000/api/households/${householdId}/accounts${options.query ?? ""}`,
    {
      method: body === undefined ? "GET" : "POST",
      headers,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    },
  );
}
beforeEach(() => {
  vi.stubEnv("WEB_ORIGIN", "http://127.0.0.1:3000");
  vi.stubEnv("API_BASE_URL", "http://127.0.0.1:3001");
  value = account;
  status = 200;
  forwarded = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      forwarded.push({ url: String(input), init: init ?? {} });
      return Response.json(value, { status });
    }),
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("account read boundary", () => {
  it("requires opaque sessions and validates every path UUID before upstream", async () => {
    expect(
      (await listAccounts(request(undefined, { cookie: "" }), householdId))
        .status,
    ).toBe(401);
    expect(
      (await getAccount(request(), householdId, "../../auth/login")).status,
    ).toBe(400);
    expect(
      (await getAccount(request(), "not-a-household", accountId)).status,
    ).toBe(400);
    expect(forwarded).toHaveLength(0);
  });
  it("forwards only bounded known list options and the opaque session", async () => {
    value = { items: [account], nextCursor: "opaque-next" };
    const response = await listAccounts(
      request(undefined, { query: "?limit=2&cursor=opaque%2Bcursor" }),
      householdId,
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual(value);
    expect(forwarded[0]?.url).toBe(
      `http://127.0.0.1:3001/v1/households/${householdId}/accounts?limit=2&cursor=opaque%2Bcursor`,
    );
    expect(new Headers(forwarded[0]?.init.headers).get("Authorization")).toBe(
      `Session ${token}`,
    );
    expect(forwarded[0]?.init.cache).toBe("no-store");
    expect(forwarded[0]?.init.redirect).toBe("error");
  });
  it.each([
    "?limit=0",
    "?limit=201",
    "?limit=1&limit=2",
    "?ownerId=other-adult",
    "?cursor=",
    `?cursor=${"x".repeat(2049)}`,
  ])("rejects invalid list input %s", async (query) => {
    expect(
      (await listAccounts(request(undefined, { query }), householdId)).status,
    ).toBe(400);
    expect(forwarded).toHaveLength(0);
  });
  it("rejects unexpected sensitive fields in account responses", async () => {
    value = { ...account, providerSecret: "must-never-echo" };
    const response = await getAccount(request(), householdId, accountId);
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("must-never-echo");
  });
  it("keeps unavailable account responses free of metadata and upstream messages", async () => {
    status = 404;
    value = { error: { code: "NOT_FOUND", message: "must-never-echo" } };
    const response = await getAccount(request(), householdId, accountId);
    expect(response.status).toBe(404);
    const body = await response.text();
    expect(body).not.toContain("must-never-echo");
    expect(body).not.toContain(account.label);
  });
});

describe("account mutation boundary", () => {
  it("checks origin and CSRF before every mutation", async () => {
    const hostile = () =>
      request(
        {},
        { origin: "https://evil.example", key: accountId, version: '"1"' },
      );
    expect((await createAccount(hostile(), householdId)).status).toBe(403);
    expect((await patchAccount(hostile(), householdId, accountId)).status).toBe(
      403,
    );
    expect((await valueAccount(hostile(), householdId, accountId)).status).toBe(
      403,
    );
    expect(
      (await grantAccount(hostile(), householdId, accountId, membershipId))
        .status,
    ).toBe(403);
    expect(forwarded).toHaveLength(0);
  });
  it("creates only validated self-owned manual accounts with an idempotency key", async () => {
    expect((await createAccount(request(createBody), householdId)).status).toBe(
      400,
    );
    expect(
      (
        await createAccount(
          request({ ...createBody, ownerId: membershipId }, { key: accountId }),
          householdId,
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await createAccount(
          request(
            { ...createBody, legalOwnerKind: "JOINT_ADULT" },
            { key: accountId },
          ),
          householdId,
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await createAccount(
          request({ ...createBody, currency: "USD" }, { key: accountId }),
          householdId,
        )
      ).status,
    ).toBe(400);
    const response = await createAccount(
      request(createBody, { key: accountId }),
      householdId,
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(account);
    expect(new Headers(forwarded[0]?.init.headers).get("Idempotency-Key")).toBe(
      accountId,
    );
    expect(forwarded[0]?.init.body).toBe(JSON.stringify(createBody));
  });
  it.each([undefined, "1", "*", '"-1"', '"2147483648"'])(
    "rejects unquoted or invalid versions %s",
    async (version) => {
      expect(
        (
          await patchAccount(
            request({ label: "Updated", liquidity: "LOCKED" }, { version }),
            householdId,
            accountId,
          )
        ).status,
      ).toBe(400);
      expect(forwarded).toHaveLength(0);
    },
  );
  it("patches only label and liquidity using the quoted account version", async () => {
    expect(
      (
        await patchAccount(
          request(
            { label: "Updated", liquidity: "LOCKED", householdId },
            { version: '"1"' },
          ),
          householdId,
          accountId,
        )
      ).status,
    ).toBe(400);
    const response = await patchAccount(
      request({ label: "Updated", liquidity: "LOCKED" }, { version: '"1"' }),
      householdId,
      accountId,
    );
    expect(response.status).toBe(200);
    expect(forwarded[0]?.init.method).toBe("PATCH");
    expect(new Headers(forwarded[0]?.init.headers).get("If-Match")).toBe('"1"');
  });
  it("preserves exact minor-unit strings, date, version and idempotency for valuations", async () => {
    const body = {
      money: { amountMinor: "9223372036854775807", currency: "GBP" },
      asOfDate: "2026-10-23",
    };
    expect(
      (
        await valueAccount(
          request(body, { version: '"1"' }),
          householdId,
          accountId,
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await valueAccount(
          request(
            { ...body, money: { ...body.money, amountMinor: "1.01" } },
            { version: '"1"', key: accountId },
          ),
          householdId,
          accountId,
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await valueAccount(
          request(body, { version: '"1"', key: accountId }),
          householdId,
          accountId,
        )
      ).status,
    ).toBe(200);
    expect(forwarded[0]?.url).toBe(
      `http://127.0.0.1:3001/v1/households/${householdId}/accounts/${accountId}/valuations`,
    );
    expect(forwarded[0]?.init.body).toBe(JSON.stringify(body));
    expect(new Headers(forwarded[0]?.init.headers).get("If-Match")).toBe('"1"');
    expect(new Headers(forwarded[0]?.init.headers).get("Idempotency-Key")).toBe(
      accountId,
    );
  });
  it("puts only the selected grant level with the independent grant version", async () => {
    const response = await grantAccount(
      request({ level: "TOTALS" }, { version: '"0"' }),
      householdId,
      accountId,
      membershipId,
    );
    expect(response.status).toBe(200);
    expect(forwarded[0]?.init.method).toBe("PUT");
    expect(new Headers(forwarded[0]?.init.headers).get("If-Match")).toBe('"0"');
    expect(forwarded[0]?.init.body).toBe('{"level":"TOTALS"}');
    expect(
      (
        await grantAccount(
          request({ level: "OWNER" }, { version: '"0"' }),
          householdId,
          accountId,
          membershipId,
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await grantAccount(
          request({ level: "NONE", ownerId: membershipId }, { version: '"1"' }),
          householdId,
          accountId,
          membershipId,
        )
      ).status,
    ).toBe(400);
  });
  it("preserves recent-MFA and version failures with safe actionable messages", async () => {
    value = {
      error: { code: "MFA_REAUTH_REQUIRED", message: "must-never-echo" },
    };
    status = 403;
    const response = await grantAccount(
      request({ level: "TRANSACTIONS" }, { version: '"1"' }),
      householdId,
      accountId,
      membershipId,
    );
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      error: {
        code: "MFA_REAUTH_REQUIRED",
        message:
          "Verify a fresh authenticator code before sharing more access.",
      },
    });
  });
});
