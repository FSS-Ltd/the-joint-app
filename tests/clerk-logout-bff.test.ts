import { afterEach, expect, it, vi } from "vitest";
import { authPost } from "../apps/web/lib/server/auth-routes.js";
import { POST as retry } from "../apps/web/app/api/auth/logout/retry/route.js";
import * as clerk from "../apps/web/lib/server/clerk-session.js";
const csrf = "x".repeat(43),
  ticket = "v1.syntheticNonce.syntheticTag.syntheticCiphertext";
function request(
  body: object,
  cookie = `joint-csrf=${csrf}`,
  origin = "http://127.0.0.1:3000",
) {
  return new Request("http://127.0.0.1:3000/api/auth/logout", {
    method: "POST",
    headers: {
      Origin: origin,
      "Content-Type": "application/json",
      Cookie: cookie,
      "X-CSRF-Token": csrf,
    },
    body: JSON.stringify(body),
  });
}
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
it("keeps cleanup capability HttpOnly and strips it from browser JSON", async () => {
  vi.stubEnv("AUTH_PROVIDER", "clerk");
  vi.spyOn(clerk, "resolveClerkSessionToken").mockResolvedValue(
    "signed.synthetic.token",
  );
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      Response.json({
        state: "SIGNED_OUT",
        providerCleanupPending: true,
        providerCleanupToken: ticket,
      }),
    ),
  );
  const response = await authPost(request({ scope: "global" }), "logout");
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({
    state: "SIGNED_OUT",
    providerCleanupPending: true,
  });
  expect(response.headers.get("set-cookie")).toContain(
    `joint-logout-cleanup=${ticket}; Path=/; HttpOnly; SameSite=Strict; Max-Age=1800`,
  );
});
it("retries with only the purpose-bound cookie after the Clerk browser session is gone", async () => {
  vi.stubEnv("AUTH_PROVIDER", "clerk");
  const source = vi.spyOn(clerk, "resolveClerkSessionToken");
  const fetcher = vi.fn(async () => Response.json({ state: "SIGNED_OUT" }));
  vi.stubGlobal("fetch", fetcher);
  const response = await retry(
    request({}, `joint-csrf=${csrf}; joint-logout-cleanup=${ticket}`),
  );
  expect(response.status).toBe(200);
  expect(source).not.toHaveBeenCalled();
  expect(fetcher).toHaveBeenCalledWith(
    new URL("http://127.0.0.1:3001/v1/auth/logout/retry"),
    expect.objectContaining({
      headers: expect.objectContaining({ "X-Logout-Cleanup": ticket }),
    }),
  );
  expect(response.headers.get("set-cookie")).toContain(
    "joint-logout-cleanup=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0",
  );
});
it("rejects foreign origins and absent or duplicate cleanup cookies before contacting the API", async () => {
  vi.stubEnv("AUTH_PROVIDER", "clerk");
  const fetcher = vi.fn();
  vi.stubGlobal("fetch", fetcher);
  expect(
    (
      await retry(
        request(
          {},
          `joint-csrf=${csrf}; joint-logout-cleanup=${ticket}`,
          "https://foreign.example.test",
        ),
      )
    ).status,
  ).toBe(403);
  expect((await retry(request({}))).status).toBe(401);
  expect(
    (
      await retry(
        request(
          {},
          `joint-csrf=${csrf}; joint-logout-cleanup=${ticket}; joint-logout-cleanup=${ticket}`,
        ),
      )
    ).status,
  ).toBe(401);
  expect(fetcher).not.toHaveBeenCalled();
});
