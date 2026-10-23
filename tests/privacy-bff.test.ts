import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  archiveAccounts,
  createExport,
  downloadExport,
  readEntitlements,
  readExport,
} from "../apps/web/lib/server/privacy-routes.js";
import {
  deletionStatus,
  leaveHousehold,
  requestDeletion,
} from "../apps/web/lib/server/privacy-lifecycle-routes.js";
const h = "11111111-1111-4111-8111-111111111111";
const id = "22222222-2222-4222-8222-222222222222";
const token = "s".repeat(43),
  csrf = "c".repeat(43),
  receiptToken = "r".repeat(43);
const job = {
  id,
  state: "READY",
  createdAt: "2026-10-23T00:00:00Z",
  expiresAt: "2099-10-24T00:00:00Z",
  downloadExpiresAt: "2099-10-23T01:00:00Z",
};
let response: () => Response;
let forwarded: { url: string; init: RequestInit }[];
function request(
  body?: object,
  cookie = `joint-session=${token}; joint-csrf=${csrf}`,
  origin = "http://127.0.0.1:3000",
  query = "",
) {
  return new Request(`http://127.0.0.1:3000/api/privacy/test${query}`, {
    method: body ? "POST" : "GET",
    headers: {
      Cookie: cookie,
      Origin: origin,
      "X-CSRF-Token": csrf,
      "Content-Type": "application/json",
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}
beforeEach(() => {
  vi.stubEnv("WEB_ORIGIN", "http://127.0.0.1:3000");
  vi.stubEnv("API_BASE_URL", "http://127.0.0.1:3001");
  forwarded = [];
  response = () => Response.json(job);
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      forwarded.push({ url: String(url), init: init ?? {} });
      return response();
    }),
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
describe("privacy BFF security boundaries", () => {
  it("requires origin, CSRF, session and strict bounded export scope before forwarding", async () => {
    const body = { accountIds: [id] };
    expect(
      (
        await createExport(
          request(body, undefined, "https://foreign.invalid"),
          h,
        )
      ).status,
    ).toBe(403);
    expect(
      (await createExport(request(body, `joint-session=${token}`), h)).status,
    ).toBe(403);
    expect(
      (await createExport(request(body, `joint-csrf=${csrf}`), h)).status,
    ).toBe(401);
    for (const value of [
      { accountIds: [] },
      { accountIds: [id, id] },
      { accountIds: [id], paid: true },
    ])
      expect((await createExport(request(value), h)).status).toBe(400);
    expect(forwarded).toHaveLength(0);
    expect((await createExport(request(body), h)).status).toBe(202);
    expect(forwarded[0]?.url).toBe(
      `http://127.0.0.1:3001/v1/households/${h}/exports`,
    );
    expect(forwarded[0]?.init).toMatchObject({
      cache: "no-store",
      redirect: "error",
      headers: { Authorization: `Session ${token}` },
      body: JSON.stringify(body),
    });
  });
  it("validates identifiers and response contracts; ignores upstream token-looking data", async () => {
    expect((await readExport(request(), "../auth", h)).status).toBe(400);
    response = () => Response.json({ ...job, storageToken: "must-not-leak" });
    const result = await readExport(request(), id, h);
    expect(result.status).toBe(503);
    expect(await result.text()).not.toContain("must-not-leak");
  });
  it("streams authenticated CSV without reading all chunks or forwarding filenames", async () => {
    let pulls = 0;
    response = () =>
      new Response(
        new ReadableStream<Uint8Array>({
          pull(controller) {
            pulls++;
            controller.enqueue(new TextEncoder().encode("synthetic,csv\n"));
            if (pulls === 3) controller.close();
          },
        }),
        {
          headers: {
            "Content-Type": "text/csv",
            "Content-Disposition": 'attachment; filename="untrusted.csv"',
          },
        },
      );
    const result = await downloadExport(request(), id, h);
    expect(pulls).toBeLessThan(3);
    expect(result.headers.get("Cache-Control")).toBe("no-store");
    expect(result.headers.get("Content-Disposition")).toContain(
      "joint-export.csv",
    );
    expect(forwarded[0]?.init.headers).toMatchObject({
      Authorization: `Session ${token}`,
    });
    expect(await result.text()).toBe("synthetic,csv\n".repeat(3));
  });
  it("blocks missing sessions and revoked/expired downloads, never relays upstream secrets", async () => {
    expect((await downloadExport(request(undefined, ""), id)).status).toBe(303);
    response = () =>
      Response.json({ secret: "hidden-storage-key" }, { status: 410 });
    const result = await downloadExport(request(), id);
    expect(result.status).toBe(303);
    expect(result.headers.get("Location")).toBe("/archive?export=unavailable");
    expect(await result.text()).not.toContain("hidden-storage-key");
    expect(
      (
        await downloadExport(
          request(
            undefined,
            undefined,
            undefined,
            "?url=https://invalid.example",
          ),
          id,
        )
      ).status,
    ).toBe(303);
  });
  it("accepts only fixed archive list queries and schema-valid read-only DTOs", async () => {
    response = () => Response.json({ items: [], nextCursor: null });
    expect((await archiveAccounts(request())).status).toBe(200);
    expect(forwarded[0]?.url).toBe(
      "http://127.0.0.1:3001/v1/me/archive/accounts?limit=50",
    );
    expect(
      (
        await archiveAccounts(
          request(undefined, undefined, undefined, "?url=x"),
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await archiveAccounts(
          request(undefined, undefined, undefined, "?limit=5&limit=10"),
        )
      ).status,
    ).toBe(400);
    expect((await archiveAccounts(request(), id, true)).status).toBe(200);
    expect(forwarded.at(-1)?.url).toBe(
      `http://127.0.0.1:3001/v1/me/archive/accounts/${id}/transactions?limit=50`,
    );
  });
  it("validates server-owned entitlements rather than client flags", async () => {
    response = () =>
      Response.json({
        plan: "FREE",
        version: "a".repeat(64),
        capabilities: ["finance.manual"],
        caps: {
          bankAuthorisations: 0,
          brokerConnections: 0,
          companionDevices: 0,
        },
        effectiveUntil: null,
      });
    expect((await readEntitlements(request(), h)).status).toBe(200);
  });
  it("clears session cookies after a confirmed leave", async () => {
    response = () => Response.json({ left: true });
    const result = await leaveHousehold(
      request({ confirmation: "LEAVE_HOUSEHOLD", requestId: id }),
      h,
    );
    expect(result.status).toBe(200);
    expect(result.headers.get("set-cookie")).toContain(
      "joint-session=; Path=/; HttpOnly",
    );
    expect(forwarded[0]?.init.method).toBe("DELETE");
  });
  it("keeps deletion status tokens only in a purpose-bound HttpOnly cookie", async () => {
    response = () =>
      Response.json({
        id,
        state: "PENDING",
        expiresAt: "2099-10-24T00:00:00Z",
        statusToken: receiptToken,
      });
    const result = await requestDeletion(
      request({ confirmation: "DELETE_MY_ACCOUNT", requestId: id }),
    );
    expect(result.status).toBe(202);
    expect(await result.text()).not.toContain(receiptToken);
    expect(result.headers.get("set-cookie")).toContain(
      `joint-deletion-receipt=${id}.${receiptToken}; Path=/api/privacy; HttpOnly; SameSite=Strict`,
    );
    expect(result.headers.get("set-cookie")).toContain("joint-session=;");
  });
  it("secures deletion receipts on HTTPS and rejects duplicate receipts", async () => {
    vi.stubEnv("WEB_ORIGIN", "https://joint.example");
    response = () =>
      Response.json({
        id,
        state: "PENDING",
        expiresAt: "2099-10-24T00:00:00Z",
        statusToken: receiptToken,
      });
    const result = await requestDeletion(
      request(
        { confirmation: "DELETE_MY_ACCOUNT", requestId: id },
        undefined,
        "https://joint.example",
      ),
    );
    expect(result.headers.get("set-cookie")).toContain("; Secure");
    const cookies = `joint-deletion-receipt=${id}.${receiptToken}; joint-deletion-receipt=${id}.${receiptToken}`;
    expect((await deletionStatus(request(undefined, cookies), id)).status).toBe(
      401,
    );
  });
  it("binds receipt lookup to cookie ID and never accepts a financial session as a receipt", async () => {
    expect((await deletionStatus(request(), id)).status).toBe(401);
    expect(
      (
        await deletionStatus(
          request(undefined, `joint-deletion-receipt=${h}.${receiptToken}`),
          id,
        )
      ).status,
    ).toBe(401);
    expect(forwarded).toHaveLength(0);
    response = () =>
      Response.json({
        id,
        state: "COMPLETED",
        requestedAt: "2026-10-23T00:00:00Z",
        completedAt: "2026-10-23T01:00:00Z",
      });
    expect(
      (
        await deletionStatus(
          request(undefined, `joint-deletion-receipt=${id}.${receiptToken}`),
          id,
        )
      ).status,
    ).toBe(200);
    expect(forwarded[0]?.init.headers).toMatchObject({
      Authorization: `Deletion ${receiptToken}`,
    });
  });
  it("preserves only safe MFA errors for export requests and status reads", async () => {
    response = () =>
      Response.json(
        {
          error: {
            code: "MFA_REAUTH_REQUIRED",
            message: "private provider detail",
          },
        },
        { status: 403 },
      );
    for (const result of [
      await createExport(request({ accountIds: [id] }), h),
      await readExport(request(), id),
    ]) {
      expect(result.status).toBe(403);
      expect(await result.json()).toEqual({
        error: {
          code: "MFA_REAUTH_REQUIRED",
          message:
            "Verify a fresh authenticator code in Account security, then try again.",
        },
      });
    }
  });
  it("returns expired MFA downloads to a fixed recovery notice", async () => {
    response = () =>
      Response.json(
        {
          error: {
            code: "MFA_REAUTH_REQUIRED",
            message: "private provider detail",
          },
        },
        { status: 403 },
      );
    expect(
      (await downloadExport(request(), id, h)).headers.get("Location"),
    ).toBe("/settings/privacy?export=mfa");
    expect((await downloadExport(request(), id)).headers.get("Location")).toBe(
      "/archive?export=mfa",
    );
  });
  it("preserves fresh MFA errors and session until deletion is accepted", async () => {
    response = () =>
      Response.json(
        { error: { code: "MFA_REAUTH_REQUIRED", message: "sensitive" } },
        { status: 403 },
      );
    const result = await requestDeletion(
      request({ confirmation: "DELETE_MY_ACCOUNT", requestId: id }),
    );
    expect(result.status).toBe(403);
    expect(result.headers.get("set-cookie")).toBeNull();
    expect(await result.json()).toMatchObject({
      error: { code: "MFA_REAUTH_REQUIRED" },
    });
  });
});
