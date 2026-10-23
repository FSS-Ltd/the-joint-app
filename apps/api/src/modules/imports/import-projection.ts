import { NotFoundException } from "@nestjs/common";
import {
  importBatchSchema,
  type AuthContext,
  type ImportBatchResponse,
} from "@joint/contracts";
import type { Prisma } from "@joint/database/client";

export const batchSelect = {
  id: true,
  householdId: true,
  accountId: true,
  state: true,
  version: true,
  datasetVersion: true,
  totalRows: true,
  processedRows: true,
  validRows: true,
  rejectedRows: true,
  overlapRows: true,
  duplicateRows: true,
  committedRows: true,
  skippedRows: true,
  failureCode: true,
  createdAt: true,
  committedAt: true,
  rolledBackAt: true,
  previewExpiresAt: true,
  object: { select: { expiresAt: true, deletedAt: true } },
} satisfies Prisma.ImportBatchSelect;
export type BatchRow = Prisma.ImportBatchGetPayload<{
  select: typeof batchSelect;
}>;
export async function findBatch(
  tx: Prisma.TransactionClient,
  context: AuthContext,
  id: string,
): Promise<BatchRow> {
  const row = await tx.importBatch.findFirst({
    where: { id, householdId: context.householdId },
    select: batchSelect,
  });
  if (!row) throw new NotFoundException();
  return row;
}
export async function projectBatch(
  tx: Prisma.TransactionClient,
  row: BatchRow,
  pristine?: boolean,
): Promise<ImportBatchResponse> {
  const [lineage] =
    row.state === "COMMITTED" && pristine === undefined
      ? await tx.$queryRaw<
          { pristine: boolean }[]
        >`SELECT app.import_is_pristine(${row.id}::uuid) AS pristine`
      : [];
  const originalAvailable = Boolean(
    row.object && !row.object.deletedAt && row.object.expiresAt > new Date(),
  );
  const failedCommit =
    row.state === "FAILED" && row.validRows > 0 && row.totalRows > 0;
  return importBatchSchema.parse({
    id: row.id,
    accountId: row.accountId,
    state: row.state,
    version: row.version,
    totalRows: row.totalRows,
    processedRows: row.processedRows,
    validRows: row.validRows,
    rejectedRows: row.rejectedRows,
    overlapRows: row.overlapRows,
    duplicateRows: row.duplicateRows,
    committedRows: row.committedRows,
    skippedRows: row.skippedRows,
    failureCode: row.failureCode,
    createdAt: row.createdAt.toISOString(),
    committedAt: row.committedAt?.toISOString() ?? null,
    rolledBackAt: row.rolledBackAt?.toISOString() ?? null,
    originalExpiresAt: row.object?.expiresAt.toISOString() ?? null,
    originalAvailable,
    permissions: {
      canCommit:
        (row.state === "READY" && row.previewExpiresAt > new Date()) ||
        (failedCommit && !row.committedAt),
      canRollback:
        row.state === "COMMITTED" && (pristine ?? Boolean(lineage?.pristine)),
      canRestore:
        row.state === "ROLLED_BACK" ||
        (failedCommit && Boolean(row.committedAt && row.rolledBackAt)),
      canDeleteOriginal: originalAvailable,
    },
  });
}
