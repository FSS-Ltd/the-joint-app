import { randomUUID } from "node:crypto";
import { afterEach, expect, it, vi } from "vitest";
import { ClerkAuthAdmin } from "../apps/worker/src/privacy/clerk-auth-admin.js";
const identity = {
  provider: "clerk" as const,
  issuer: "https://synthetic.clerk.accounts.dev",
  subject: "user_synthetic",
};
afterEach(() => vi.unstubAllGlobals());
const provider = () =>
  new ClerkAuthAdmin({
    CLERK_SECRET_KEY: "sk_test_synthetic_fixture_only",
    CLERK_ISSUER: identity.issuer,
    CLERK_TIMEOUT_MS: 50,
  });
it("deletes the journalled external subject, never the internal UUID", async () => {
  const fetcher = vi.fn(async () =>
    Response.json({ object: "user", id: identity.subject, deleted: true }),
  );
  vi.stubGlobal("fetch", fetcher);
  expect(await provider().deleteUser(randomUUID(), undefined, [identity])).toBe(
    true,
  );
  expect(fetcher).toHaveBeenCalledExactlyOnceWith(
    "https://api.clerk.com/v1/users/user_synthetic",
    expect.objectContaining({ method: "DELETE", redirect: "error" }),
  );
});
it("requires structured absence and rechecks it with GET", async () => {
  const fetcher = vi.fn(async () =>
    Response.json(
      { errors: [{ code: "resource_not_found" }] },
      { status: 404 },
    ),
  );
  vi.stubGlobal("fetch", fetcher);
  expect(await provider().deleteUser(randomUUID(), undefined, [identity])).toBe(
    true,
  );
  expect(fetcher.mock.calls).toHaveLength(2);
});
it("keeps deletion pending for outages, generic 404, wrong identity and mismatched issuer", async () => {
  for (const response of [
    new Response("not found", { status: 404 }),
    Response.json({ id: "user_other", deleted: true }),
    new Response("", { status: 503 }),
  ]) {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => response),
    );
    expect(
      await provider().deleteUser(randomUUID(), undefined, [identity]),
    ).toBe(false);
  }
  const fetcher = vi.fn();
  vi.stubGlobal("fetch", fetcher);
  expect(
    await provider().deleteUser(randomUUID(), undefined, [
      { ...identity, issuer: "https://other.clerk.accounts.dev" },
    ]),
  ).toBe(false);
  expect(fetcher).not.toHaveBeenCalled();
});
it("does not mistake an unmapped legacy UUID for a Clerk subject", async () => {
  const fetcher = vi.fn();
  vi.stubGlobal("fetch", fetcher);
  expect(await provider().deleteUser(randomUUID())).toBe(false);
  expect(fetcher).not.toHaveBeenCalled();
});
it("bounds responses and keeps cleanup pending when legacy reconciliation fails", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response("x".repeat(4097))),
  );
  expect(await provider().deleteUser(randomUUID(), undefined, [identity])).toBe(
    false,
  );
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      Response.json({ object: "user", id: identity.subject, deleted: true }),
    ),
  );
  const cleanup = vi.fn(async () => false);
  const combined = new ClerkAuthAdmin(
    {
      CLERK_SECRET_KEY: "sk_test_synthetic_fixture_only",
      CLERK_ISSUER: identity.issuer,
      CLERK_TIMEOUT_MS: 50,
    },
    { deleteUser: cleanup },
  );
  expect(await combined.deleteUser(randomUUID(), undefined, [identity])).toBe(
    false,
  );
  expect(cleanup).toHaveBeenCalledTimes(1);
});
