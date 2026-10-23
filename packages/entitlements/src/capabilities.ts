import type {
  EntitlementCapability,
  EntitlementResponse,
} from "@joint/contracts";

const capabilities: readonly EntitlementCapability[] = [
  "finance.manual",
  "projections.basic",
  "connections.bank",
  "connections.broker",
  "projections.advanced",
  "categorisation.automation",
  "insights.local",
];
const freeCapabilities: readonly EntitlementCapability[] = [
  "finance.manual",
  "projections.basic",
];
const maximumGrantDuration = 90 * 24 * 60 * 60 * 1000;

export interface EntitlementGrant {
  readonly capabilities: readonly EntitlementCapability[];
  readonly issuedAt: Date;
  readonly expiresAt: Date;
  readonly revokedAt: Date | null;
}

/** Product capabilities never confer access to accounts or provider resources. */
export function resolveEntitlements(
  grants: readonly EntitlementGrant[],
  now: Date,
): Omit<EntitlementResponse, "version"> {
  const enabled = new Set(freeCapabilities);
  let effectiveUntil: number | null = null;
  for (const grant of grants) {
    const issued = grant.issuedAt.getTime();
    const expiry = grant.expiresAt.getTime();
    if (
      !(
        issued <= now.getTime() &&
        expiry > now.getTime() &&
        expiry - issued <= maximumGrantDuration
      ) ||
      grant.revokedAt !== null
    )
      continue;
    const paid = grant.capabilities.filter(
      (capability) => !freeCapabilities.includes(capability),
    );
    if (!paid.length) continue;
    for (const capability of paid) enabled.add(capability);
    effectiveUntil = Math.min(effectiveUntil ?? expiry, expiry);
  }
  return {
    plan: enabled.size > freeCapabilities.length ? "PLUS" : "FREE",
    capabilities: capabilities.filter((capability) => enabled.has(capability)),
    caps: {
      bankAuthorisations: enabled.has("connections.bank") ? 4 : 0,
      brokerConnections: enabled.has("connections.broker") ? 2 : 0,
      companionDevices: enabled.has("insights.local") ? 1 : 0,
    },
    effectiveUntil:
      effectiveUntil === null ? null : new Date(effectiveUntil).toISOString(),
  };
}
