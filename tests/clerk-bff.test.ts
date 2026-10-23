import { GET as bootstrap } from "../apps/web/app/api/bootstrap/route.js";
import { randomUUID } from "node:crypto";
import { createAccount } from "../apps/web/lib/server/account-routes.js";
import { afterEach, expect, it, vi } from "vitest";
import { readAuthProvider } from "../packages/contracts/src/clerk.js";
import {
  resolveClerkSessionToken,
  sessionAuthorization,
} from "../apps/web/lib/server/clerk-session.js";

it("requires explicit provider selection when Clerk settings are present", () => {
  expect(readAuthProvider({})).toBe("local");
  expect(readAuthProvider({ AUTH_PROVIDER: "clerk" })).toBe("clerk");
  expect(() =>
    readAuthProvider({ CLERK_SECRET_KEY: "PRIVATE_SENTINEL" }),
  ).toThrow("Invalid environment fields: AUTH_PROVIDER");
  expect(() => readAuthProvider({ AUTH_PROVIDER: "unknown" })).toThrow(
    "Invalid environment fields: AUTH_PROVIDER",
  );
});
it("uses only the server SDK token source and produces the configured transport", async () => {
  const source = vi.fn(async () => "signed.synthetic.token");
  expect(await resolveClerkSessionToken(source)).toBe("signed.synthetic.token");
  expect(source).toHaveBeenCalledTimes(1);
  expect(sessionAuthorization("signed.synthetic.token", "clerk")).toBe(
    "Bearer signed.synthetic.token",
  );
  expect(sessionAuthorization("x".repeat(43), "local")).toBe(
    "Session " + "x".repeat(43),
  );
});
it("does not accept one provider's credential shape as the other provider", () => {
  expect(() => sessionAuthorization("x".repeat(43), "clerk")).toThrow();
  expect(() =>
    sessionAuthorization("signed.synthetic.token", "local"),
  ).toThrow();
});
it("returns safe unauthorized/unavailable responses for absent tokens and SDK errors", async () => {
  await expect(
    resolveClerkSessionToken(async () => null),
  ).rejects.toMatchObject({ status: 401 });
  await expect(
    resolveClerkSessionToken(async () => "oversized".repeat(3000)),
  ).rejects.toMatchObject({ status: 401 });
  await expect(
    resolveClerkSessionToken(async () => {
      throw new Error("PRIVATE_PROVIDER_SENTINEL");
    }),
  ).rejects.toMatchObject({
    status: 503,
    message: "Sign-in is unavailable. Check local auth setup or retry shortly.",
  });
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
it("Clerk-mode writes still reject foreign origin or missing CSRF before looking up identity", async () => {
  vi.stubEnv("AUTH_PROVIDER", "clerk");
  const fetcher = vi.fn();
  vi.stubGlobal("fetch", fetcher);
  for (const origin of [
    "https://foreign.example.test",
    "http://127.0.0.1:3000",
  ]) {
    const request = new Request("http://127.0.0.1:3000/api/accounts", {
      method: "POST",
      headers: { Origin: origin, "Content-Type": "application/json" },
      body: "{}",
    });
    expect((await createAccount(request, randomUUID())).status).toBe(403);
  }
  expect(fetcher).not.toHaveBeenCalled();
});

it("Clerk bootstrap does not fall back to legacy cookies or provision keyless auth when setup is missing", async () => {
  vi.stubEnv("AUTH_PROVIDER", "clerk");
  vi.stubEnv("CLERK_SECRET_KEY", undefined);
  vi.stubEnv("CLERK_ISSUER", undefined);
  vi.stubEnv("CLERK_JWT_KEY", undefined);
  vi.stubEnv("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", undefined);
  const fetcher = vi.fn();
  vi.stubGlobal("fetch", fetcher);
  const response = await bootstrap();
  expect(response.status).toBe(503);
  expect(response.headers.get("Cache-Control")).toBe("no-store");
  expect(fetcher).not.toHaveBeenCalled();
});
