import { randomBytes, randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import { FundingEvidenceService } from "../apps/api/src/modules/funding-evidence/funding-evidence.service.js";
import { FundingCursors } from "../apps/api/src/modules/funding-evidence/funding-cursors.js";
import { safeFundingQuery } from "../apps/api/src/modules/funding-evidence/funding-errors.js";
import { IdentityVault } from "../apps/api/src/modules/identity/identity-vault.js";
const fail = async (): Promise<never> => {
  throw Error("Database must not be called");
};
const key = randomBytes(32).toString("base64"),
  vault = new IdentityVault(key, key);
const context = {
  userId: randomUUID(),
  sessionId: randomUUID(),
  householdId: randomUUID(),
  membershipId: randomUUID(),
  requestId: randomUUID(),
  aal: "aal1" as const,
  mfaAuthenticatedAt: null,
  grantVersion: 0,
};
it("requires fresh MFA before owner or archive evidence export", async () => {
  const service = new FundingEvidenceService(
    { withScope: fail },
    { withScope: fail },
    vault,
  );
  await expect(service.export(context, randomUUID())).rejects.toMatchObject({
    status: 403,
  });
  await expect(
    service.exportArchive(context, randomUUID()),
  ).rejects.toMatchObject({ status: 403 });
});
it("binds funding cursors and validates their version payload", () => {
  const cursors = new FundingCursors(vault),
    binding = "synthetic:owner:session:account:active";
  expect(cursors.read(undefined, binding)).toBe(0);
  const cursor = cursors.seal(50, binding);
  expect(cursors.read(cursor, binding)).toBe(50);
  for (const bad of [
    cursor,
    "forged",
    vault.seal(JSON.stringify(-1), binding + "other"),
  ])
    expect(() => cursors.read(bad, binding + "other")).toThrow();
});
it("maps known database errors without source values or SQL details", async () => {
  for (const [code, status, errorCode] of [
    ["P0003", 409, "FUNDING_UNAVAILABLE"],
    ["P0004", 409, "SETTLEMENT_IMMUTABLE"],
    ["40001", 409, "VERSION_CONFLICT"],
    ["42501", 404, undefined],
    ["22023", 400, undefined],
  ] as const) {
    const call = safeFundingQuery(async () => {
      throw { meta: { code, message: "private source details" } };
    });
    await expect(call).rejects.toMatchObject({ status });
    try {
      await call;
    } catch (error) {
      expect(JSON.stringify(error)).not.toContain("private source details");
      if (errorCode) expect(JSON.stringify(error)).toContain(errorCode);
    }
  }
});
