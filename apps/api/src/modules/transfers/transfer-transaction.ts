import { NotFoundException } from "@nestjs/common";
import type {
  AuthContext,
  ClassificationKind,
  transferResultSchema,
} from "@joint/contracts";
import type { Prisma } from "@joint/database/client";
import { lockOwnedAccount } from "../accounts/account-transaction.js";
import { readTransaction } from "../transactions/transaction-projection.js";

export type TransferResult = ReturnType<typeof transferResultSchema.parse>;
export type TransferLeg = Prisma.TransactionGetPayload<{
  include: { override: true };
}>;
export async function lockTransferLegs(
  tx: Prisma.TransactionClient,
  context: AuthContext,
  fromId: string,
  toId: string,
): Promise<{ from: TransferLeg; to: TransferLeg }> {
  const ids = [fromId, toId];
  const visible = await tx.transaction.findMany({
    where: {
      id: { in: ids },
      householdId: context.householdId,
      status: "BOOKED",
    },
    select: { id: true, accountId: true },
  });
  if (visible.length !== 2) throw new NotFoundException();
  for (const accountId of [
    ...new Set(visible.map((row) => row.accountId)),
  ].sort())
    await lockOwnedAccount(tx, context, accountId);
  await tx.$queryRaw`SELECT id FROM app."Transaction" WHERE id=ANY(${ids}::uuid[])
    AND "householdId"=${context.householdId}::uuid ORDER BY id FOR UPDATE`;
  const current = await tx.transaction.findMany({
    where: {
      id: { in: ids },
      householdId: context.householdId,
      status: "BOOKED",
    },
    include: { override: true },
  });
  const from = current.find((row) => row.id === fromId),
    to = current.find((row) => row.id === toId);
  if (!from || !to) throw new NotFoundException();
  return { from, to };
}
export async function applyTransferKind(
  tx: Prisma.TransactionClient,
  context: AuthContext,
  row: TransferLeg,
  kind: ClassificationKind | null,
  operation: "TRANSFER_CONFIRM" | "TRANSFER_REMOVE",
): Promise<void> {
  await tx.transactionOverride.upsert({
    where: { transactionId: row.id },
    create: {
      householdId: context.householdId,
      accountId: row.accountId,
      transactionId: row.id,
      authorMembershipId: context.membershipId,
      classificationKind: kind,
    },
    update: { classificationKind: kind, version: { increment: 1 } },
    select: { transactionId: true },
  });
  await tx.transaction.update({
    where: { id: row.id },
    data: { version: { increment: 1 } },
    select: { id: true },
  });
  await tx.account.update({
    where: { id: row.accountId },
    data: { version: { increment: 1 } },
    select: { id: true },
  });
  await tx.transactionRevision.create({
    data: {
      householdId: context.householdId,
      accountId: row.accountId,
      transactionId: row.id,
      actorMembershipId: context.membershipId,
      version: row.version + 1,
      kind: operation,
      data: {
        before: {
          classificationKind: row.override?.classificationKind ?? null,
        },
        after: { classificationKind: kind },
      },
    },
    select: { id: true },
  });
}
export async function transferResult(
  tx: Prisma.TransactionClient,
  context: AuthContext,
  id: string,
  fromId: string,
  toId: string,
): Promise<TransferResult> {
  // Sequential queries avoid sharing an executing pg connection across callbacks.
  const from = await readTransaction(tx, context, fromId);
  const to = await readTransaction(tx, context, toId);
  return { id, from, to };
}
