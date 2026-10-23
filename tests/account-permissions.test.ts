import { expect, it } from "vitest";
import type { AuthContext } from "../packages/contracts/dist/index.js";
import {
  requireFreshMfa,
  widensGrant,
} from "../apps/api/src/modules/accounts/account-transaction.js";

const context: AuthContext = {
  userId: "",
  membershipId: "",
  householdId: "",
  sessionId: "",
  requestId: "",
  grantVersion: 0,
  aal: "aal2",
  mfaAuthenticatedAt: Date.now(),
};
it("requires actual recent TOTP proof for sharing widening", () => {
  for (const mfaAuthenticatedAt of [
    null,
    Date.now() - 301_000,
    Date.now() + 60_000,
    Number.NaN,
  ])
    expect(() => requireFreshMfa({ ...context, mfaAuthenticatedAt })).toThrow();
  expect(() => requireFreshMfa({ ...context, aal: "aal1" })).toThrow();
  expect(() => requireFreshMfa(context)).not.toThrow();
  expect(widensGrant("NONE", "TOTALS")).toBe(true);
  expect(widensGrant("TOTALS", "TRANSACTIONS")).toBe(true);
  expect(widensGrant("TRANSACTIONS", "TOTALS")).toBe(false);
});
