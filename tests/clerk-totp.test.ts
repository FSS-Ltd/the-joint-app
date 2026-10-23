import { afterEach, expect, it, vi } from "vitest";
import { createClerkTotpVerifier } from "../apps/api/src/modules/identity/clerk/totp-verifier.js";
import { createClerkFixture } from "./fixtures/clerk.js";

const fixture = await createClerkFixture();
afterEach(() => vi.unstubAllGlobals());
it("accepts only explicit TOTP verification from the fixed provider endpoint", async () => {
  const send = vi.fn(async () =>
    Response.json({ verified: true, code_type: "totp" }),
  );
  vi.stubGlobal("fetch", send);
  const verifier = createClerkTotpVerifier(fixture.environment);
  expect(await verifier.verify("user_synthetic", "123456")).toBe(true);
  expect(send).toHaveBeenCalledWith(
    "https://api.clerk.com/v1/users/user_synthetic/verify_totp",
    expect.objectContaining({
      method: "POST",
      body: JSON.stringify({ code: "123456" }),
      redirect: "error",
      cache: "no-store",
    }),
  );
  send.mockResolvedValueOnce(
    Response.json({ verified: true, code_type: "backup_code" }),
  );
  expect(await verifier.verify("user_synthetic", "123456")).toBe(false);
});
it("rejects incorrect and rate-limited codes without leaking provider details", async () => {
  const send = vi.fn(async () =>
    Response.json({ error: "PRIVATE" }, { status: 422 }),
  );
  vi.stubGlobal("fetch", send);
  const verifier = createClerkTotpVerifier(fixture.environment);
  expect(await verifier.verify("user_synthetic", "123456")).toBe(false);
  send.mockResolvedValueOnce(
    Response.json({ error: "PRIVATE" }, { status: 429 }),
  );
  expect(await verifier.verify("user_synthetic", "123456")).toBe(false);
});
it("bounds an unresponsive verification and reports safe service failure", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(() => new Promise(() => {})),
  );
  const verifier = createClerkTotpVerifier({
    ...fixture.environment,
    CLERK_TIMEOUT_MS: 100,
  });
  await expect(
    verifier.verify("user_synthetic", "123456"),
  ).rejects.toMatchObject({
    status: 503,
    message: "Authenticator verification is unavailable.",
  });
});
