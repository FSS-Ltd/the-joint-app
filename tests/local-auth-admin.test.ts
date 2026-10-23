import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { expect, it } from "vitest";
import { LocalAuthAdmin } from "../apps/worker/src/privacy/local-auth-admin.js";

it("bounds local provider cleanup, confirms absence and never follows a redirect with admin credentials", async () => {
  const key = "SYNTHETIC_ADMIN_SENTINEL_FOR_TEST";
  const id = randomUUID();
  let missingCode = true;
  let status = 200,
    requests = 0;
  const server = createServer((request, response) => {
    requests++;
    expect(request.url).toBe(`/auth/v1/admin/users/${id}`);
    expect(request.headers.authorization).toBe(`Bearer ${key}`);
    response.statusCode = status;
    response.setHeader("Location", "https://hosted.invalid/secret");
    response.end(
      status === 404 && missingCode
        ? JSON.stringify({ error_code: "user_not_found" })
        : "SYNTHETIC_PAYLOAD_SENTINEL",
    );
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address();
    if (!address || typeof address === "string")
      throw new Error("Missing local fixture port");
    const provider = new LocalAuthAdmin(
      `http://127.0.0.1:${address.port}/auth/v1`,
      key,
    );
    expect(await provider.deleteUser(id)).toBe(true);
    status = 404;
    expect(await provider.deleteUser(id)).toBe(true);
    missingCode = false;
    expect(await provider.deleteUser(id)).toBe(false);
    status = 500;
    expect(await provider.deleteUser(id)).toBe(false);
    status = 307;
    expect(await provider.deleteUser(id)).toBe(false);
    expect(await provider.deleteUser("../../invalid")).toBe(false);
    expect(requests).toBe(5);
    const abort = new AbortController();
    abort.abort();
    expect(await provider.deleteUser(id, abort.signal)).toBe(false);
    expect(
      () => new LocalAuthAdmin("https://hosted.invalid/auth/v1", key),
    ).toThrow("Invalid environment fields: PRIVACY_AUTH_URL");
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
