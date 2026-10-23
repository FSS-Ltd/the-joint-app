import { describe, expect, it } from "vitest";
import {
  resolveEntitlements,
  type EntitlementGrant,
} from "../packages/entitlements/src/index.js";

const now = new Date("2026-10-23T12:00:00Z");
const grant = (
  overrides: Partial<EntitlementGrant> = {},
): EntitlementGrant => ({
  capabilities: ["connections.bank", "insights.local"],
  issuedAt: new Date("2026-10-22T12:00:00Z"),
  expiresAt: new Date("2026-11-22T12:00:00Z"),
  revokedAt: null,
  ...overrides,
});
describe("server entitlement calculation", () => {
  it("keeps free manual finance and basic projections with zero paid resources", () => {
    expect(resolveEntitlements([], now)).toEqual({
      plan: "FREE",
      capabilities: ["finance.manual", "projections.basic"],
      caps: {
        bankAuthorisations: 0,
        brokerConnections: 0,
        companionDevices: 0,
      },
      effectiveUntil: null,
    });
  });
  it("enables only named capabilities and their resource caps", () => {
    expect(resolveEntitlements([grant()], now)).toEqual({
      plan: "PLUS",
      capabilities: [
        "finance.manual",
        "projections.basic",
        "connections.bank",
        "insights.local",
      ],
      caps: {
        bankAuthorisations: 4,
        brokerConnections: 0,
        companionDevices: 1,
      },
      effectiveUntil: "2026-11-22T12:00:00.000Z",
    });
    expect(
      resolveEntitlements(
        [grant({ capabilities: ["connections.broker"] })],
        now,
      ).caps,
    ).toEqual({
      bankAuthorisations: 0,
      brokerConnections: 2,
      companionDevices: 0,
    });
  });
  it("excludes expired, revoked, future and overlong grants", () => {
    for (const invalid of [
      grant({ expiresAt: now }),
      grant({ revokedAt: now }),
      grant({ issuedAt: new Date(now.getTime() + 1) }),
      grant({ expiresAt: new Date("2027-10-23T12:00:00Z") }),
      grant({ issuedAt: new Date("invalid") }),
    ])
      expect(resolveEntitlements([invalid], now).plan).toBe("FREE");
  });
  it("deduplicates capabilities, ignores free-only grants and reports the earliest applicable expiry", () => {
    const result = resolveEntitlements(
      [
        grant({
          capabilities: ["finance.manual"],
          expiresAt: new Date("2026-10-24T12:00:00Z"),
        }),
        grant(),
        grant({
          capabilities: ["connections.bank", "projections.advanced"],
          expiresAt: new Date("2026-10-25T12:00:00Z"),
        }),
      ],
      now,
    );
    expect(result.capabilities).toEqual([
      "finance.manual",
      "projections.basic",
      "connections.bank",
      "projections.advanced",
      "insights.local",
    ]);
    expect(result.effectiveUntil).toBe("2026-10-25T12:00:00.000Z");
  });
});
