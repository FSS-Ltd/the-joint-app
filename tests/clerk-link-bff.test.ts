import { randomBytes } from "node:crypto";
import { afterEach, expect, it, vi } from "vitest";
import { linkLegacy } from "../apps/web/lib/server/legacy-link-route.js";
import * as clerk from "../apps/web/lib/server/clerk-session.js";
const origin = "http://127.0.0.1:3000",
  csrf = randomBytes(32).toString("base64url"),
  legacy = randomBytes(32).toString("base64url");
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
function request(overrides: Record<string, string> = {}) {
  return new Request(origin + "/api/auth/link-legacy", {
    method: "POST",
    headers: {
      Origin: origin,
      "Content-Type": "application/json",
      Cookie: `joint-csrf=${csrf}; joint-session=${legacy}`,
      "X-CSRF-Token": csrf,
      ...overrides,
    },
    body: JSON.stringify({ factorId: "clerk_totp", code: "123456" }),
  });
}
it("sends separate server-only proofs and clears the old cookie after a successful link", async () => {
  vi.stubEnv("AUTH_PROVIDER", "clerk");
  vi.spyOn(clerk, "resolveClerkSessionToken").mockResolvedValue(
    "signed.synthetic.token",
  );
  const fetcher = vi.fn(async () => Response.json({ state: "AUTHENTICATED" }));
  vi.stubGlobal("fetch", fetcher);
  const response = await linkLegacy(request());
  expect(response.status).toBe(200);
  expect(await response.text()).toBe('{"state":"AUTHENTICATED"}');
  expect(response.headers.get("set-cookie")).toContain(
    "joint-session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0",
  );
  expect(fetcher).toHaveBeenCalledWith(
    new URL("http://127.0.0.1:3001/v1/auth/link-legacy"),
    expect.objectContaining({
      headers: expect.objectContaining({
        Authorization: "Bearer signed.synthetic.token",
        "X-Legacy-Session": legacy,
      }),
    }),
  );
});
it("rejects foreign origins, missing CSRF and absent legacy proof before provider lookup", async () => {
  vi.stubEnv("AUTH_PROVIDER", "clerk");
  const token = vi
    .spyOn(clerk, "resolveClerkSessionToken")
    .mockResolvedValue("signed.synthetic.token");
  const fetcher = vi.fn();
  vi.stubGlobal("fetch", fetcher);
  for (const [headers, status] of [
    [{ Origin: "https://foreign.example.test" }, 403],
    [{ "X-CSRF-Token": "" }, 403],
    [{ Cookie: `joint-csrf=${csrf}` }, 401],
  ] as const) {
    expect((await linkLegacy(request(headers))).status).toBe(status);
  }
  expect(fetcher).not.toHaveBeenCalled();
  expect(token).not.toHaveBeenCalled();
});
