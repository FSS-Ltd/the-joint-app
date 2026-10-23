import { NotFoundException } from "@nestjs/common";
import {
  transactionSchema,
  type AuthContext,
  type TransactionResponse,
} from "@joint/contracts";
import { effectiveClassification } from "@joint/domain/cash-flow";
import type { Prisma } from "@joint/database/client";

type TransactionRow = Prisma.TransactionGetPayload<{
  include: {
    override: true;
    notes: true;
    account: { select: { kind: true } };
    splits: true;
    transfersFrom: true;
    transfersTo: true;
  };
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
    account: { select: { kind: true } },
    splits: { orderBy: { position: "asc" } },
    transfersFrom: { where: { active: true } },
    transfersTo: { where: { active: true } },
    notes: { where: { authorUserId: context.userId } },
  } satisfies Prisma.TransactionInclude;
}
export function projectTransaction(
  row: TransactionRow,
  owned: boolean,
  paired = false,
): TransactionResponse {
  const note = row.notes[0];
  const pair = row.transfersFrom[0] ?? row.transfersTo[0];
  const classification = effectiveClassification(
    row.account.kind,
    row.amountMinor.toString(),
    row.override?.classificationKind ?? null,
  );
  const linked = paired || pair !== undefined;
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
    classificationKind: row.override?.classificationKind ?? null,
    effectiveKind: row.splits.length ? null : classification.kind,
    classificationConfirmed:
      row.splits.length > 0 || !classification.provisional,
    splits: row.splits.map((line) => ({
      id: line.id,
      position: line.position,
      category: line.category,
      classificationKind: line.classificationKind,
      money: { amountMinor: line.amountMinor.toString(), currency: "GBP" },
    })),
    transfer: linked
      ? { confirmed: true, id: pair?.id ?? null, canRemove: pair !== undefined }
      : null,
    note: { body: note?.body ?? null, version: note?.version ?? 0 },
    permissions: {
      canCorrect:
        owned &&
        row.sourceNamespace === "MANUAL" &&
        row.splits.length === 0 &&
        !linked,
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
  const paired = await pairedTransactionIds(tx, [id]);
  return projectTransaction(
    row,
    await ownsAccount(tx, context, row.accountId),
    paired.has(id),
  );
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

export async function pairedTransactionIds(
  tx: Prisma.TransactionClient,
  ids: readonly string[],
): Promise<Set<string>> {
  if (ids.length === 0) return new Set();
  const rows = await tx.$queryRaw<
    { id: string }[]
  >`SELECT app.paired_transaction_ids(${[...ids]}::uuid[]) AS id`;
  return new Set(rows.map((row) => row.id));
}
