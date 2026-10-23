import { afterEach, expect, it, vi } from "vitest";
import { createClerkRevoker } from "../apps/api/src/modules/identity/clerk/session-revoker.js";
afterEach(() => vi.unstubAllGlobals());
it("global retry revokes only sessions created at or before the original cutoff", async () => {
  const paths: string[] = [];
  vi.stubGlobal("fetch", async (url: string) => {
    paths.push(new URL(url).pathname);
    return Response.json(
      url.includes("?")
        ? {
            data: [
              { id: "sess_old", user_id: "user_synthetic", created_at: 1000 },
              { id: "sess_later", user_id: "user_synthetic", created_at: 2001 },
            ],
            total_count: 2,
          }
        : { id: "sess_old", user_id: "user_synthetic", status: "revoked" },
    );
  });
  await createClerkRevoker({
    CLERK_SECRET_KEY: "sk_test_synthetic",
    CLERK_ISSUER: "https://synthetic.clerk.accounts.dev",
    CLERK_JWT_KEY: "unused",
    CLERK_AUTHORIZED_PARTIES: ["http://127.0.0.1:3000"],
    CLERK_TIMEOUT_MS: 1000,
  }).revoke(
    "user_synthetic",
    "sess_old",
    "global",
    new AbortController().signal,
    2000,
  );
  expect(paths).toEqual(["/v1/sessions", "/v1/sessions/sess_old/revoke"]);
});

it("does not report successful cleanup for an unrelated or still-active provider session", async () => {
  vi.stubGlobal("fetch", async () =>
    Response.json({
      id: "sess_other",
      user_id: "user_synthetic",
      status: "active",
    }),
  );
  await expect(
    createClerkRevoker({
      CLERK_SECRET_KEY: "sk_test_synthetic",
      CLERK_ISSUER: "https://synthetic.clerk.accounts.dev",
      CLERK_JWT_KEY: "unused",
      CLERK_AUTHORIZED_PARTIES: ["http://127.0.0.1:3000"],
      CLERK_TIMEOUT_MS: 1000,
    }).revoke(
      "user_synthetic",
      "sess_old",
      "local",
      new AbortController().signal,
      2000,
    ),
  ).rejects.toThrow();
});

it.each([true, false])(
  "rechecks a missing revoke target before accepting absence (absent=%s)",
  async (absent) => {
    const paths: string[] = [];
    vi.stubGlobal("fetch", async (url: string) => {
      const path = new URL(url).pathname;
      paths.push(path);
      return path.endsWith("/revoke") || absent
        ? new Response(null, { status: 404 })
        : Response.json({
            id: "sess_old",
            user_id: "user_synthetic",
            status: "active",
          });
    });
    const cleanup = createClerkRevoker({
      CLERK_SECRET_KEY: "sk_test_synthetic",
      CLERK_ISSUER: "https://synthetic.clerk.accounts.dev",
      CLERK_JWT_KEY: "unused",
      CLERK_AUTHORIZED_PARTIES: ["http://127.0.0.1:3000"],
      CLERK_TIMEOUT_MS: 1000,
    }).revoke(
      "user_synthetic",
      "sess_old",
      "local",
      new AbortController().signal,
      2000,
    );
    if (absent) await expect(cleanup).resolves.toBeUndefined();
    else await expect(cleanup).rejects.toThrow();
    expect(paths).toEqual([
      "/v1/sessions/sess_old/revoke",
      "/v1/sessions/sess_old",
    ]);
  },
);
