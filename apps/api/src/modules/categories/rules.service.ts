import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common";
import {
  categorisationRulesResponseSchema,
  categorisationRuleSchema,
  type AuthContext,
  type CategorisationRule,
  type CategorisationRuleCreate,
  type CategorisationRuleUpdate,
  type CategorisationRulesResponse,
} from "@joint/contracts";
import type { ScopedDatabase } from "@joint/database/scoped";
import type { EntitlementService } from "../entitlements/entitlement.service.js";

export class CategorisationRulesService {
  constructor(
    private readonly database: ScopedDatabase,
    private readonly entitlements: EntitlementService,
  ) {}

  async list(context: AuthContext): Promise<CategorisationRulesResponse> {
    return this.database.withScope(context, async (tx) => {
      const rows = await tx.categorisationRule.findMany({
        where: { householdId: context.householdId },
        orderBy: [{ priority: "asc" }, { createdAt: "asc" }],
      });
      return categorisationRulesResponseSchema.parse({
        rules: rows.map((r) => ({
          id: r.id,
          householdId: r.householdId,
          authorMembershipId: r.authorMembershipId,
          merchantPattern: r.merchantPattern,
          category: r.category,
          priority: r.priority,
          enabled: r.enabled,
          version: r.version,
          createdAt: r.createdAt.toISOString(),
          updatedAt: r.updatedAt.toISOString(),
        })),
      });
    });
  }

  async create(
    context: AuthContext,
    input: CategorisationRuleCreate,
  ): Promise<CategorisationRule> {
    await this.entitlements.require(context, "categorisation.automation");

    return this.database.withScope(context, async (tx) => {
      const created = await tx.categorisationRule.create({
        data: {
          householdId: context.householdId,
          authorMembershipId: context.membershipId,
          merchantPattern: input.merchantPattern,
          category: input.category,
          priority: input.priority,
          enabled: input.enabled,
        },
      });

      return categorisationRuleSchema.parse({
        id: created.id,
        householdId: created.householdId,
        authorMembershipId: created.authorMembershipId,
        merchantPattern: created.merchantPattern,
        category: created.category,
        priority: created.priority,
        enabled: created.enabled,
        version: created.version,
        createdAt: created.createdAt.toISOString(),
        updatedAt: created.updatedAt.toISOString(),
      });
    });
  }

  async update(
    context: AuthContext,
    id: string,
    input: CategorisationRuleUpdate,
    expectedVersion: number,
  ): Promise<CategorisationRule> {
    await this.entitlements.require(context, "categorisation.automation");

    return this.database.withScope(context, async (tx) => {
      const existing = await tx.categorisationRule.findUnique({
        where: { id },
      });
      if (!existing || existing.householdId !== context.householdId) {
        throw new NotFoundException();
      }
      if (existing.authorMembershipId !== context.membershipId) {
        throw new ForbiddenException();
      }
      if (existing.version !== expectedVersion) {
        throw new ConflictException({ error: { code: "VERSION_CONFLICT" } });
      }

      const updated = await tx.categorisationRule.update({
        where: { id },
        data: {
          merchantPattern: input.merchantPattern ?? existing.merchantPattern,
          category: input.category ?? existing.category,
          priority: input.priority ?? existing.priority,
          enabled: input.enabled ?? existing.enabled,
          version: { increment: 1 },
        },
      });

      return categorisationRuleSchema.parse({
        id: updated.id,
        householdId: updated.householdId,
        authorMembershipId: updated.authorMembershipId,
        merchantPattern: updated.merchantPattern,
        category: updated.category,
        priority: updated.priority,
        enabled: updated.enabled,
        version: updated.version,
        createdAt: updated.createdAt.toISOString(),
        updatedAt: updated.updatedAt.toISOString(),
      });
    });
  }

  async delete(context: AuthContext, id: string): Promise<void> {
    // Reading/deleting an existing rule does not require categorisation.automation
    return this.database.withScope(context, async (tx) => {
      const existing = await tx.categorisationRule.findUnique({
        where: { id },
      });
      if (!existing || existing.householdId !== context.householdId) {
        throw new NotFoundException();
      }
      if (existing.authorMembershipId !== context.membershipId) {
        throw new ForbiddenException();
      }
      await tx.categorisationRule.delete({ where: { id } });
    });
  }
}
