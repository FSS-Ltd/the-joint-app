import { BadRequestException } from "@nestjs/common";
import {
  idempotencyKeySchema,
  contributionBudgetDtoSchema,
  type AuthContext,
} from "@joint/contracts";
import type { OwnerArchiveContext } from "@joint/database/archive";
import type { IdentityVault } from "../../identity/identity-vault.js";
import type { ContributionSelection } from "./contribution-queries.js";

export type ContributionOperation = "read" | "history" | "export";
export function contributionBinding(
  context: AuthContext | OwnerArchiveContext,
  selection: ContributionSelection,
  archived: boolean,
  operation: ContributionOperation | "list",
): string {
  const mode =
    !archived && "membershipId" in context
      ? `active:${context.householdId}:${context.membershipId}:${context.grantVersion}`
      : "archive";
  return `contributions:${mode}:${context.userId}:${context.sessionId}:${selection.budgetId ?? "current"}:${selection.goalId ?? "all"}:${operation}`;
}
export class ContributionCursors {
  constructor(private readonly vault: IdentityVault) {}
  seal(budgetId: string, version: number, binding: string): string {
    return this.vault.seal(JSON.stringify([budgetId, version]), binding);
  }
  read(
    cursor: string | undefined,
    binding: string,
  ): { budgetId: string; version: number } | null {
    if (cursor === undefined) return null;
    try {
      const value: unknown = JSON.parse(this.vault.open(cursor, binding));
      if (!Array.isArray(value) || value.length !== 2) throw new Error();
      return {
        budgetId: idempotencyKeySchema.parse(value[0]).toLowerCase(),
        version: contributionBudgetDtoSchema.shape.version.parse(value[1]),
      };
    } catch {
      throw new BadRequestException({ error: { code: "INVALID_CURSOR" } });
    }
  }
}
