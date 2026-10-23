import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { authPost } from "../apps/web/lib/server/auth-routes.js";
import {
  acceptInvitation,
  captureInvitation,
  createHousehold,
  inviteToHousehold,
} from "../apps/web/lib/server/household-routes.js";
import { GET as csrf } from "../apps/web/app/api/auth/csrf/route.js";
import { GET as me } from "../apps/web/app/api/me/route.js";

const opaque = "a".repeat(43);
const invitation = "b".repeat(43);
const csrfToken = "c".repeat(43);
const uuid = "11111111-1111-4111-8111-111111111111";
const credentials = {
  email: "alex@example.test",
  password: "a long fixture password",
};
const household = {
  id: uuid,
  name: "Synthetic home",
  baseCurrency: "GBP",
  timezone: "Europe/London",
};
const identity = {
  user: { id: uuid, email: credentials.email },
  membership: null,
  session: {
    aal: "aal1",
    expiresAt: "2026-10-24T00:00:00.000Z",
    needsMfa: false,
    mfaVerifiedAt: null,
    purpose: "NORMAL",
  },
  factors: [],
};
let upstreamValue: unknown;
let upstreamStatus: number;
let forwarded: { url: string; init: RequestInit }[];

function post(
  body: unknown = {},
  options: {
    origin?: string | null;
    csrf?: string | null;
    cookie?: string;
    contentType?: string;
    key?: string;
  } = {},
): Request {
  const headers: Record<string, string> = {
    "Content-Type": options.contentType ?? "application/json",
    Cookie:
      options.cookie ?? `joint-csrf=${csrfToken}; joint-session=${opaque}`,
  };
  if (options.origin !== null)
    headers.Origin = options.origin ?? "http://127.0.0.1:3000";
  if (options.csrf !== null)
    headers["X-CSRF-Token"] = options.csrf ?? csrfToken;
  if (options.key) headers["Idempotency-Key"] = options.key;
  return new Request("http://127.0.0.1:3000/api/auth/signup", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}
function getMe(cookie = `joint-session=${opaque}`): Promise<Response> {
  return me(
    new Request("http://127.0.0.1:3000/api/me", { headers: { cookie } }),
  );
}

beforeEach(() => {
  vi.stubEnv("WEB_ORIGIN", "http://127.0.0.1:3000");
  vi.stubEnv("API_BASE_URL", "http://127.0.0.1:3001");
  upstreamValue = { state: "VERIFY_EMAIL" };
  upstreamStatus = 200;
  forwarded = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      forwarded.push({ url: String(input), init: init ?? {} });
      return Response.json(upstreamValue, { status: upstreamStatus });
    }),
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("browser request boundary", () => {
  it.each([
    { origin: "https://evil.example" },
    { origin: null },
    { csrf: null },
    { csrf: "d".repeat(43) },
    { cookie: `joint-csrf=${csrfToken}; joint-csrf=${csrfToken}` },
  ])(
    "rejects invalid origin or CSRF before reaching upstream: %j",
    async (options) => {
      expect(
        (await authPost(post(credentials, options), "signup")).status,
      ).toBe(403);
      expect(forwarded).toHaveLength(0);
    },
  );
  it("requires JSON, bounded bodies and strict valid inputs", async () => {
    expect(
      (await authPost(post({}, { contentType: "text/plain" }), "signup"))
        .status,
    ).toBe(415);
    expect(
      (await authPost(post({ padding: "x".repeat(9000) }), "signup")).status,
    ).toBe(413);
    expect(
      (await authPost(post({ email: "bad", password: "short" }), "signup"))
        .status,
    ).toBe(400);
    expect(
      (
        await authPost(
          post({ ...credentials, access_token: "untrusted" }),
          "signup",
        )
      ).status,
    ).toBe(400);
    expect(forwarded).toHaveLength(0);
  });
  it("issues private CSRF cookies and enables Secure outside loopback", async () => {
    const response = await csrf(
      new Request("http://127.0.0.1:3000/api/auth/csrf", {
        headers: { cookie: `joint-csrf=${csrfToken}` },
      }),
    );
    expect(await response.json()).toEqual({ csrfToken });
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("set-cookie")).toContain(
      "HttpOnly; SameSite=Strict; Max-Age=3600",
    );
    vi.stubEnv("WEB_ORIGIN", "https://joint.example");
    expect(
      (
        await csrf(new Request("https://joint.example/api/auth/csrf"))
      ).headers.get("set-cookie"),
    ).toContain("; Secure");
  });
});

describe("opaque session boundary", () => {
  it("stores the opaque login token in an HttpOnly cookie and returns only state", async () => {
    upstreamValue = { state: "AUTHENTICATED", browserToken: opaque };
    const response = await authPost(post(credentials), "login");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ state: "AUTHENTICATED" });
    expect(response.headers.get("set-cookie")).toContain(
      `joint-session=${opaque}; Path=/; HttpOnly; SameSite=Lax; Max-Age=604800`,
    );
    expect(forwarded[0]?.url).toBe("http://127.0.0.1:3001/v1/auth/login");
    expect(forwarded[0]?.init).toMatchObject({
      cache: "no-store",
      redirect: "error",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
    });
    expect(new Headers(forwarded[0]?.init.headers).has("Authorization")).toBe(
      false,
    );
    expect(forwarded[0]?.init.signal).toBeInstanceOf(AbortSignal);
  });
  it("fails closed on missing session tokens, unexpected states and provider token fields", async () => {
    for (const value of [
      { state: "AUTHENTICATED" },
      { state: "SIGNED_OUT", browserToken: opaque },
      {
        state: "AUTHENTICATED",
        browserToken: opaque,
        access_token: "must-never-echo",
      },
    ]) {
      upstreamValue = value;
      const response = await authPost(post(credentials), "login");
      expect(response.status).toBe(503);
      expect(await response.text()).not.toContain("must-never-echo");
      expect(response.headers.has("set-cookie")).toBe(false);
    }
  });
  it("requires an opaque session for me and validates the complete response", async () => {
    expect((await getMe("")).status).toBe(401);
    expect((await getMe("joint-access=legacy-token")).status).toBe(401);
    expect(forwarded).toHaveLength(0);
    upstreamValue = identity;
    const response = await getMe();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(identity);
    expect(new Headers(forwarded[0]?.init.headers).get("Authorization")).toBe(
      `Session ${opaque}`,
    );
    upstreamValue = { ...identity, refresh_token: "must-never-echo" };
    const invalid = await getMe();
    expect(invalid.status).toBe(503);
    expect(await invalid.text()).not.toContain("must-never-echo");
  });
  it("clears session, CSRF and invitation cookies only after successful logout", async () => {
    upstreamValue = {
      error: { code: "INTERNAL_ERROR", message: "must-never-echo" },
    };
    upstreamStatus = 503;
    const failed = await authPost(post({ scope: "global" }), "logout");
    expect(failed.headers.has("set-cookie")).toBe(false);
    expect(await failed.text()).not.toContain("must-never-echo");
    upstreamValue = { state: "SIGNED_OUT" };
    upstreamStatus = 200;
    const response = await authPost(post({ scope: "global" }), "logout");
    expect(response.status).toBe(200);
    expect(response.headers.getSetCookie()).toHaveLength(3);
    expect(
      response.headers
        .getSetCookie()
        .every((value) => value.includes("Max-Age=0")),
    ).toBe(true);
  });
});

describe("household and invitation boundary", () => {
  it("requires idempotency and safe household IDs, and forwards only the validated key", async () => {
    upstreamValue = household;
    expect(
      (await createHousehold(post({ name: "Synthetic home" }))).status,
    ).toBe(400);
    expect(
      (await createHousehold(post({ name: "Synthetic home" }, { key: uuid })))
        .status,
    ).toBe(200);
    expect(new Headers(forwarded[0]?.init.headers).get("Idempotency-Key")).toBe(
      uuid,
    );
    expect(
      (
        await inviteToHousehold(
          post({ email: "sam@example.test" }, { key: uuid }),
          "../../auth/login",
        )
      ).status,
    ).toBe(400);
    expect(forwarded).toHaveLength(1);
  });
  it("captures an invitation privately without accepting it or calling upstream", async () => {
    const response = await captureInvitation(post({ token: invitation }));
    expect(response.status).toBe(200);
    expect(forwarded).toHaveLength(0);
    expect(response.headers.get("set-cookie")).toContain(
      `joint-pending-invite=${invitation}; Path=/; HttpOnly; SameSite=Lax; Max-Age=600`,
    );
    expect(await response.text()).not.toContain(invitation);
  });
  it("accepts only an explicit empty-body request using the private pending cookie", async () => {
    expect((await acceptInvitation(post())).status).toBe(400);
    const cookie = `joint-csrf=${csrfToken}; joint-session=${opaque}; joint-pending-invite=${invitation}`;
    expect(
      (await acceptInvitation(post({ token: invitation }, { cookie }))).status,
    ).toBe(400);
    expect(forwarded).toHaveLength(0);
    upstreamValue = household;
    const response = await acceptInvitation(post({}, { cookie }));
    expect(response.status).toBe(200);
    expect(forwarded[0]?.init.body).toBe(JSON.stringify({ token: invitation }));
    expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
  });
  it("clears an invalid invitation cookie but preserves it after a temporary upstream failure", async () => {
    const cookie = `joint-csrf=${csrfToken}; joint-session=${opaque}; joint-pending-invite=${invitation}`;
    upstreamValue = {
      error: { code: "INVITATION_UNAVAILABLE", message: "not forwarded" },
    };
    upstreamStatus = 404;
    const invalid = await acceptInvitation(post({}, { cookie }));
    expect(invalid.status).toBe(404);
    expect(invalid.headers.get("set-cookie")).toContain(
      "joint-pending-invite=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0",
    );
    upstreamStatus = 503;
    const unavailable = await acceptInvitation(post({}, { cookie }));
    expect(unavailable.status).toBe(503);
    expect(unavailable.headers.has("set-cookie")).toBe(false);
  });
  it("returns useful allowlisted errors without forwarding upstream messages", async () => {
    upstreamStatus = 409;
    upstreamValue = {
      error: { code: "HOUSEHOLD_FULL", message: "must-never-echo" },
    };
    const response = await createHousehold(
      post({ name: "Synthetic home" }, { key: uuid }),
    );
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: {
        code: "HOUSEHOLD_FULL",
        message: "This household already has two members.",
      },
    });
  });
});
