import { NotFoundException, UnauthorizedException } from "@nestjs/common";
import type { Prisma, PrismaClient } from "@joint/database/client";
import type { IdentityPrincipal } from "../identity/identity-context.js";

export async function asActor<T>(
  database: PrismaClient,
  principal: IdentityPrincipal,
  apply: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  return database.$transaction(async (tx) => {
    const user = await tx.$queryRaw<
      { id: string }[]
    >`SELECT id FROM app."User" WHERE id = ${principal.userId}::uuid AND status = 'ACTIVE' FOR UPDATE`;
    const session = await tx.sessionRegistry.findFirst({
      where: {
        id: principal.sessionId,
        userId: principal.userId,
        revokedAt: null,
        expiresAt: { gt: new Date() },
        purpose: "NORMAL",
      },
    });
    if (!user.length || !session) throw new UnauthorizedException();
    return apply(tx);
  });
}
export async function lockHousehold(
  tx: Prisma.TransactionClient,
  id: string,
): Promise<void> {
  const rows = await tx.$queryRaw<
    { id: string }[]
  >`SELECT id FROM app."Household" WHERE id = ${id}::uuid FOR UPDATE`;
  if (!rows.length) throw new NotFoundException();
}
export async function bindSessions(
  tx: Prisma.TransactionClient,
  userId: string,
  householdId: string,
): Promise<void> {
  await tx.sessionRegistry.updateMany({
    where: { userId, revokedAt: null },
    data: { householdId },
  });
}
export async function audit(
  tx: Prisma.TransactionClient,
  userId: string,
  householdId: string,
  action: string,
): Promise<void> {
  await tx.auditEvent.create({ data: { userId, householdId, action } });
}
