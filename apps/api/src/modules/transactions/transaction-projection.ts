import { NotFoundException } from "@nestjs/common";
import {
  transactionSchema,
  type AuthContext,
  type TransactionResponse,
} from "@joint/contracts";
import type { Prisma } from "@joint/database/client";

type TransactionRow = Prisma.TransactionGetPayload<{
  include: { override: true; notes: true };
}>;
export async function ownsAccount(
  tx: Prisma.TransactionClient,
  context: AuthContext,
  accountId: string,
): Promise<boolean> {
  return Boolean(
    await tx.accountOwner.findFirst({
      where: {
        accountId,
        householdId: context.householdId,
        membershipId: context.membershipId,
        userId: context.userId,
        status: "ACTIVE",
      },
    }),
  );
}
export function transactionInclude(context: AuthContext) {
  return {
    override: true,
    notes: { where: { authorUserId: context.userId } },
  } satisfies Prisma.TransactionInclude;
}
export function projectTransaction(
  row: TransactionRow,
  owned: boolean,
): TransactionResponse {
  const note = row.notes[0];
  return transactionSchema.parse({
    id: row.id,
    accountId: row.accountId,
    bookedDate: row.bookedDate.toISOString().slice(0, 10),
    money: { amountMinor: row.amountMinor.toString(), currency: row.currency },
    description: row.description,
    source: row.sourceNamespace,
    version: row.version,
    createdAt: row.createdAt.toISOString(),
    category: row.override?.category ?? null,
    merchant: row.override?.merchant ?? null,
    note: { body: note?.body ?? null, version: note?.version ?? 0 },
    permissions: {
      canCorrect: owned && row.sourceNamespace === "MANUAL",
      canClassify: owned,
      canNote: true,
    },
  });
}
export async function readTransaction(
  tx: Prisma.TransactionClient,
  context: AuthContext,
  id: string,
): Promise<TransactionResponse> {
  const row = await tx.transaction.findFirst({
    where: { id, householdId: context.householdId, status: "BOOKED" },
    include: transactionInclude(context),
  });
  if (!row) throw new NotFoundException();
  return projectTransaction(row, await ownsAccount(tx, context, row.accountId));
}
export async function lockTransactionAccount(
  tx: Prisma.TransactionClient,
  context: AuthContext,
  id: string,
  ownerOnly: boolean,
): Promise<{
  accountId: string;
  version: number;
  sourceNamespace: "CSV" | "MANUAL";
}> {
  const row = await tx.transaction.findFirst({
    where: { id, householdId: context.householdId, status: "BOOKED" },
    select: { accountId: true, version: true, sourceNamespace: true },
  });
  if (!row) throw new NotFoundException();
  const [account] = await tx.$queryRaw<
    { allowed: boolean }[]
  >`SELECT app.lock_account_for_annotation(${row.accountId}::uuid) AS allowed`;
  if (
    !account?.allowed ||
    (ownerOnly && !(await ownsAccount(tx, context, row.accountId)))
  )
    throw new NotFoundException();
  const current = await tx.transaction.findFirst({
    where: { id, householdId: context.householdId, status: "BOOKED" },
    select: { accountId: true, version: true, sourceNamespace: true },
  });
  if (!current) throw new NotFoundException();
  return current;
}
