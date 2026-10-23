import { expect, it } from "vitest";
import { principalFromClaims } from "../apps/api/src/modules/identity/identity-context.js";
it("separates recent TOTP proof from a later password authentication or JWT refresh", () => {
  const claims = {
    sub: "11111111-1111-4111-8111-111111111111",
    session_id: "22222222-2222-4222-8222-222222222222",
    role: "authenticated" as const,
    aal: "aal2" as const,
    exp: 9999999999,
    amr: [
      { method: "totp", timestamp: 100 },
      { method: "password", timestamp: 500 },
    ],
  };
  const principal = principalFromClaims(claims, "synthetic-email-hash");
  expect(principal.authenticatedAt).toBe(500000);
  expect(principal.mfaAuthenticatedAt).toBe(100000);
  expect(
    principalFromClaims(
      { ...claims, amr: [{ method: "password", timestamp: 600 }] },
      "hash",
    ).mfaAuthenticatedAt,
  ).toBeNull();
});
