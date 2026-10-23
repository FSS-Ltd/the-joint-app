import { randomBytes } from "node:crypto";
import { IdentityVault } from "../apps/api/src/modules/identity/identity-vault.js";
import { expect, it } from "vitest";
import { GoalService } from "../apps/api/src/modules/goals/goals.service.js";
import { goalDatabaseError } from "../apps/api/src/modules/goals/goal-errors.js";
import type { AuthContext } from "../packages/contracts/src/index.js";
const fail = async (): Promise<never> => {
  throw Error("Database must not be called");
};
const key = randomBytes(32).toString("base64");
const service = new GoalService(
  { withScope: fail },
  { withScope: fail },
  new IdentityVault(key, key),
);
const context: AuthContext = {
  userId: "00000000-0000-4000-8000-000000000001",
  membershipId: "00000000-0000-4000-8000-000000000002",
  householdId: "00000000-0000-4000-8000-000000000003",
  sessionId: "00000000-0000-4000-8000-000000000004",
  aal: "aal1",
  mfaAuthenticatedAt: null,
  grantVersion: 0,
  requestId: "request",
};
it("requires fresh MFA before active or archive export without an entitlement gate", async () => {
  await expect(service.export(context, context.userId)).rejects.toMatchObject({
    status: 403,
  });
  await expect(
    service.exportArchive(
      { ...context, aal: "aal2", mfaAuthenticatedAt: Date.now() - 300001 },
      context.userId,
    ),
  ).rejects.toMatchObject({ status: 403 });
});
it("maps only expected database failures to safe HTTP errors", () => {
  for (const [code, status] of [
    ["42501", 404],
    ["P0002", 404],
    ["40001", 409],
    ["22023", 400],
  ] as const) {
    const error = {
      meta: {
        driverAdapterError: {
          cause: { originalCode: code, originalMessage: "private" },
        },
      },
    };
    const mapped = goalDatabaseError(error);
    expect(mapped).toMatchObject({ status });
    expect(JSON.stringify(mapped)).not.toContain("private");
  }
  const unexpected = Error("Unexpected failure");
  expect(goalDatabaseError(unexpected)).toBe(unexpected);
});
it("binds encrypted cursors to actor, session, goal and active/archive scope", async () => {
  const { GoalCursors } =
    await import("../apps/api/src/modules/goals/goal-cursors.js");
  const { IdentityVault } =
    await import("../apps/api/src/modules/identity/identity-vault.js");
  const { randomBytes } = await import("node:crypto");
  const key = randomBytes(32).toString("base64"),
    cursors = new GoalCursors(new IdentityVault(key, key));
  const binding = "active:synthetic-user:session:household:membership:0:goal";
  const cursor = cursors.seal(50, binding);
  expect(cursors.version(cursor, binding)).toBe(50);
  for (const other of [
    "archive:synthetic-user:session:goal",
    binding + "other",
    binding.replace("session", "revoked"),
  ])
    expect(() => cursors.version(cursor, other)).toThrow();
  expect(() => cursors.version("forged", binding)).toThrow();
});
