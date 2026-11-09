import { createHash } from "node:crypto";
import { ForbiddenException } from "@nestjs/common";
import {
  entitlementCapabilitySchema,
  type AuthContext,
  type EntitlementCapability,
  type EntitlementResponse,
} from "@joint/contracts";
import type { ScopedDatabase } from "@joint/database/scoped";
import {
  resolveEntitlements,
  type EntitlementGrant,
} from "@joint/entitlements";

interface GrantRow {
  id: string | null;
  revision: number | null;
  capabilities: string[] | null;
  issuedAt: Date | null;
  expiresAt: Date | null;
  revokedAt: Date | null;
  now: Date;
  valid: boolean;
}

export class EntitlementService {
  constructor(private readonly scoped: ScopedDatabase) {}

  async read(context: AuthContext): Promise<EntitlementResponse> {
    return this.scoped.withScope(context, async (tx) => {
      // One statement takes its time and recipient grants from the database.
      // RLS independently checks the live session and membership on this read.
      const rows = await tx.$queryRaw<GrantRow[]>`
        WITH clock AS MATERIALIZED (SELECT clock_timestamp() AS now)
        SELECT g.id,g.revision,g.capabilities,g."issuedAt",g."expiresAt",g."revokedAt",clock.now,app.scope_is_valid() AS valid
        FROM clock LEFT JOIN app."EntitlementGrant" g ON
          g."householdId"=${context.householdId}::uuid AND
          g."membershipId"=${context.membershipId}::uuid AND g."userId"=${context.userId}::uuid
        ORDER BY g.id`;
      if (!rows[0]?.valid)
        throw new Error("Authorization scope is no longer valid");
      const now = rows[0].now;
      if (!now) throw new Error("Entitlement clock unavailable");
      const grants: EntitlementGrant[] = [];
      const revisions: [string, number][] = [];
      for (const row of rows) {
        if (row.id === null) continue;
        if (
          row.revision === null ||
          row.issuedAt === null ||
          row.expiresAt === null
        )
          throw new Error("Invalid stored entitlement");
        grants.push({
          capabilities: entitlementCapabilitySchema
            .array()
            .parse(row.capabilities),
          issuedAt: row.issuedAt,
          expiresAt: row.expiresAt,
          revokedAt: row.revokedAt,
        });
        revisions.push([row.id, row.revision]);
      }

      interface SubRow {
        id: string;
        status: string;
        effectiveUntil: Date;
        graceUntil: Date | null;
        updatedAt: Date;
      }
      const subRows = await tx.$queryRaw<SubRow[]>`
        SELECT s.id, s.status, s."effectiveUntil", s."graceUntil", s."updatedAt"
        FROM app."Subscription" s
        WHERE s."householdId"=${context.householdId}::uuid
          AND s.status IN ('ACTIVE', 'GRACE_PERIOD', 'CANCELED')
        ORDER BY s."updatedAt" DESC`;

      const grantResult = resolveEntitlements(grants, now);

      let hasActiveSub = false;
      let subEffectiveUntil: Date | null = null;
      for (const sub of subRows) {
        const until =
          sub.graceUntil && sub.graceUntil > sub.effectiveUntil
            ? sub.graceUntil
            : sub.effectiveUntil;
        if (until.getTime() > now.getTime()) {
          hasActiveSub = true;
          if (
            subEffectiveUntil === null ||
            until.getTime() > subEffectiveUntil.getTime()
          ) {
            subEffectiveUntil = until;
          }
          revisions.push([sub.id, sub.updatedAt.getTime()]);
        }
      }

      let result: Omit<EntitlementResponse, "version">;
      if (hasActiveSub) {
        const effectiveUntilIso = subEffectiveUntil
          ? subEffectiveUntil.toISOString()
          : grantResult.effectiveUntil;
        const combinedEffectiveUntil =
          grantResult.effectiveUntil && effectiveUntilIso
            ? new Date(
                Math.max(
                  new Date(grantResult.effectiveUntil).getTime(),
                  new Date(effectiveUntilIso).getTime(),
                ),
              ).toISOString()
            : (effectiveUntilIso ?? grantResult.effectiveUntil);

        result = {
          plan: "PLUS",
          capabilities: [
            "finance.manual",
            "projections.basic",
            "connections.bank",
            "connections.broker",
            "projections.advanced",
            "categorisation.automation",
            "insights.local",
          ],
          caps: {
            bankAuthorisations: 4,
            brokerConnections: 2,
            companionDevices: 1,
          },
          effectiveUntil: combinedEffectiveUntil,
        };
      } else {
        result = grantResult;
      }

      const version = createHash("sha256")
        .update(JSON.stringify({ revisions, result }))
        .digest("hex");
      return { ...result, version };
    });
  }

  async require(
    context: AuthContext,
    capability: EntitlementCapability,
  ): Promise<void> {
    const result = await this.read(context);
    if (!result.capabilities.includes(capability))
      throw new ForbiddenException({
        error: {
          code: "CAPABILITY_UNAVAILABLE",
          message: "This capability is unavailable.",
        },
      });
  }
}
