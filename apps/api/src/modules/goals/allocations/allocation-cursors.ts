import { BadRequestException } from "@nestjs/common";
import {
  allocationHistoryCursorSchema,
  type AuthContext,
  type GoalAllocationRawPage,
} from "@joint/contracts";
import type { OwnerArchiveContext } from "@joint/database/archive";
import type { IdentityVault } from "../../identity/identity-vault.js";

type AllocationCursor = NonNullable<GoalAllocationRawPage["nextAfter"]>;
export function allocationBinding(
  context: AuthContext | OwnerArchiveContext,
  archived: boolean,
  goalId: string,
  accountIds: readonly string[],
): string {
  const mode =
    !archived && "membershipId" in context
      ? `active:${context.householdId}:${context.membershipId}:${context.grantVersion}`
      : "archive";
  return `allocations:${mode}:${context.userId}:${context.sessionId}:${goalId}:${accountIds.join(",")}`;
}
export class AllocationCursors {
  constructor(private readonly vault: IdentityVault) {}
  seal(value: AllocationCursor, binding: string): string {
    return this.vault.seal(JSON.stringify(value), binding);
  }
  read(cursor: string | undefined, binding: string): AllocationCursor | null {
    if (cursor === undefined) return null;
    try {
      return allocationHistoryCursorSchema.parse(
        JSON.parse(this.vault.open(cursor, binding)),
      );
    } catch {
      throw new BadRequestException({ error: { code: "INVALID_CURSOR" } });
    }
  }
}
