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
      const result = resolveEntitlements(grants, now);
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
