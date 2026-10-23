import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import type { AuthContext, GrantLevel } from "@joint/contracts";
import type { Prisma } from "@joint/database/client";
import { lockHousehold, audit } from "../households/household-transaction.js";

export async function lockActor(
  tx: Prisma.TransactionClient,
  context: AuthContext,
): Promise<void> {
  const users = await tx.$queryRaw<
    { id: string }[]
  >`SELECT id FROM app."User" WHERE id=${context.userId}::uuid AND status='ACTIVE' FOR UPDATE`;
  await lockHousehold(tx, context.householdId);
  const [scope] = await tx.$queryRaw<
    { valid: boolean }[]
  >`SELECT app.scope_is_valid() AS valid`;
  if (!users.length || !scope?.valid) throw new UnauthorizedException();
}

export async function lockOwnedAccount(
  tx: Prisma.TransactionClient,
  context: AuthContext,
  accountId: string,
): Promise<void> {
  const accounts = await tx.$queryRaw<
    { id: string }[]
  >`SELECT id FROM app."Account" WHERE id=${accountId}::uuid AND "householdId"=${context.householdId}::uuid AND "archivedAt" IS NULL FOR UPDATE`;
  const owner = await tx.accountOwner.findFirst({
    where: {
      accountId,
      householdId: context.householdId,
      userId: context.userId,
      membershipId: context.membershipId,
      status: "ACTIVE",
    },
  });
  if (!accounts.length || !owner) throw new NotFoundException();
}

export function requireVersion(actual: number, expected: number): void {
  if (actual !== expected)
    throw new ConflictException({ error: { code: "VERSION_CONFLICT" } });
}
export function requireMfa(context: AuthContext): void {
  if (context.aal !== "aal2")
    throw new ForbiddenException({ error: { code: "MFA_REQUIRED" } });
}
export function requireFreshMfa(
  context: Pick<AuthContext, "aal" | "mfaAuthenticatedAt">,
): void {
  const proof = context.mfaAuthenticatedAt;
  if (
    context.aal !== "aal2" ||
    proof === null ||
    !Number.isSafeInteger(proof) ||
    proof < Date.now() - 300_000 ||
    proof > Date.now()
  )
    throw new ForbiddenException({ error: { code: "MFA_REAUTH_REQUIRED" } });
}
export function widensGrant(before: GrantLevel, after: GrantLevel): boolean {
  const rank = { NONE: 0, TOTALS: 1, TRANSACTIONS: 2 };
  return rank[after] > rank[before];
}
export async function recordChange(
  tx: Prisma.TransactionClient,
  context: AuthContext,
  action: string,
): Promise<void> {
  await tx.household.update({
    where: { id: context.householdId },
    data: { revision: { increment: 1 } },
  });
  await audit(tx, context.userId, context.householdId, action);
}
