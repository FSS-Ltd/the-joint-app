import { expect, it, vi } from "vitest";
import { StatusResources } from "../apps/api/src/modules/events/status-resources.js";
import { statusSubscriptionSchema } from "../packages/contracts/src/events.js";

it("rejects ambiguous selectors and never accepts credentials or arbitrary topics", () => {
  const id = "e237d3d7-236f-4ec3-8454-c4e5504d397f";
  expect(
    statusSubscriptionSchema.safeParse({ kind: "import", id, householdId: id })
      .success,
  ).toBe(true);
  for (const value of [
    { kind: "import", id },
    { kind: "deletion", id, token: "secret" },
    { kind: "archive-export", id, householdId: id },
    { kind: "sql", id },
    { kind: ["import", "export"], id, householdId: id },
  ])
    expect(statusSubscriptionSchema.safeParse(value).success).toBe(false);
});

it("rechecks live authority and expiry, but ignores request IDs in private fingerprints", async () => {
  const base = {
    userId: "user",
    sessionId: "session",
    householdId: "household",
    membershipId: "member",
    grantVersion: 0,
    requestId: "request-a",
    aal: "aal2" as const,
    mfaAuthenticatedAt: Date.now(),
    authenticatedAt: Date.now(),
  };
  const identity = {
    financeContext: vi.fn(async () => base),
    actor: vi.fn(async () => ({ ...base, emailHash: "opaque" })),
    subscriptionExpiry: vi.fn(async () => Date.now() + 100000),
  };
  const status = {
    id: "e237d3d7-236f-4ec3-8454-c4e5504d397f",
    accountId: "e237d3d7-236f-4ec3-8454-c4e5504d397f",
    state: "READY" as const,
    version: 1,
    totalRows: 2,
    processedRows: 2,
    validRows: 2,
    rejectedRows: 0,
    overlapRows: 0,
    duplicateRows: 0,
    committedRows: 0,
    skippedRows: 0,
    failureCode: null,
    createdAt: new Date().toISOString(),
    committedAt: null,
    rolledBackAt: null,
    originalExpiresAt: null,
    originalAvailable: false,
    permissions: {
      canCommit: true,
      canRollback: false,
      canRestore: false,
      canDeleteOriginal: false,
    },
  };
  const imports = {
    observe: vi.fn(async () => ({ status, expiresAt: Date.now() + 5000 })),
  };
  const resources = new StatusResources({ identity, imports });
  const selector = {
    kind: "import" as const,
    id: "e237d3d7-236f-4ec3-8454-c4e5504d397f",
    householdId: "e237d3d7-236f-4ec3-8454-c4e5504d397f",
  };
  const auth = `Session ${"a".repeat(43)}`;
  const first = await resources.read(selector, auth);
  identity.financeContext.mockResolvedValueOnce({
    ...base,
    requestId: "request-b",
  });
  expect((await resources.read(selector, auth)).fingerprint).toBe(
    first.fingerprint,
  );
  identity.financeContext.mockResolvedValueOnce({ ...base, grantVersion: 1 });
  expect((await resources.read(selector, auth)).fingerprint).not.toBe(
    first.fingerprint,
  );
  identity.financeContext.mockRejectedValueOnce(new Error("revoked"));
  await expect(resources.read(selector, auth)).rejects.toThrow("revoked");
  expect(imports.observe).toHaveBeenCalledTimes(3);
  expect(identity.subscriptionExpiry).toHaveBeenCalledTimes(3);
  expect(first.fingerprint).not.toContain("household");
});
