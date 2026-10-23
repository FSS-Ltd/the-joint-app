import { normalizedCsvRowSchema, type ValidCsvRow } from "@joint/contracts";
import type { Prisma } from "@joint/database/client";
import type { JobLease } from "@joint/database/jobs";
import type { ImportJobContext } from "@joint/database/scoped";
import { randomUUID } from "node:crypto";
import { csvSourceIdentity } from "./preview.js";

const CHUNK_SIZE = 500;
type StagedSource = {
  sourceId: string;
  sourceHash: string;
  batchState: string;
};
type PreviewSlice = { row: Prisma.JsonValue; decision: string | null };
function offsetFromPayload(payload: Prisma.JsonValue): number {
  if (!payload || typeof payload !== "object" || Array.isArray(payload))
    throw new Error("Invalid import job payload");
  const offset = payload.offset ?? 0;
  if (
    typeof offset !== "number" ||
    !Number.isInteger(offset) ||
    offset < 0 ||
    offset > 50_000 ||
    Object.keys(payload).some((key) => key !== "offset")
  )
    throw new Error("Invalid import job payload");
  return offset;
}

async function publish(
  tx: Prisma.TransactionClient,
  context: ImportJobContext,
  committedRows: number,
  skippedRows: number,
  firstCommittedAt?: Date | null,
): Promise<void> {
  const now = firstCommittedAt ?? new Date();
  await tx.importBatch.update({
    where: { id: context.batchId },
    select: { id: true },
    data: {
      state: "COMMITTED",
      committedRows,
      skippedRows,
      committedAt: now,
      rolledBackAt: null,
      version: { increment: 1 },
      failureCode: null,
    },
  });
  await tx.$executeRaw`SELECT app.advance_import_account_version(${context.batchId}::uuid)`;
  await tx.importObject.updateMany({
    where: { batchId: context.batchId, deletedAt: null },
    data: { expiresAt: new Date(now.getTime() + 7 * 24 * 60 * 60_000) },
  });
  await tx.household.update({
    where: { id: context.householdId },
    data: { revision: { increment: 1 } },
  });
  await tx.auditEvent.create({
    data: {
      userId: context.userId,
      householdId: context.householdId,
      action: firstCommittedAt ? "IMPORT_RESTORED" : "IMPORT_COMMITTED",
    },
  });
  await tx.outboxEvent.create({
    data: {
      householdId: context.householdId,
      jobId: context.jobId,
      type: firstCommittedAt ? "csv.restored" : "csv.committed",
      payload: { batchId: context.batchId, committedRows, skippedRows },
    },
  });
}

export async function commitImport(
  tx: Prisma.TransactionClient,
  context: ImportJobContext,
  lease: JobLease,
): Promise<void> {
  const offset = offsetFromPayload(lease.payload);
  const batch = await tx.importBatch.findUniqueOrThrow({
    where: { id: context.batchId },
    select: {
      state: true,
      fileChecksum: true,
      totalRows: true,
      processedRows: true,
      committedRows: true,
      skippedRows: true,
      version: true,
    },
  });
  if (batch.state === "COMMITTED") return;
  if (batch.state !== "COMMITTING") throw new Error("Import state unavailable");
  if (batch.processedRows > offset) return;
  if (batch.processedRows !== offset)
    throw new Error("Import progress unavailable");
  const slice = await tx.$queryRaw<
    PreviewSlice[]
  >`SELECT item.value AS row,b.decisions ->> (item.value ->> 'rowNumber') AS decision FROM app."ImportBatch" b CROSS JOIN LATERAL jsonb_array_elements(jsonb_path_query_array(b.preview, ${`$[${offset} to ${offset + CHUNK_SIZE - 1}]`}::jsonpath)) WITH ORDINALITY AS item(value, ordinal) WHERE b.id=${context.batchId}::uuid ORDER BY item.ordinal`;
  if (!slice.length && offset < batch.totalRows)
    throw new Error("Import preview unavailable");
  const keep: ValidCsvRow[] = [];
  let skipped = 0;
  for (const item of slice) {
    const row = normalizedCsvRowSchema.parse(item.row);
    if (row.status === "REJECTED") {
      skipped++;
      continue;
    }
    const decision = item.decision ?? row.decision;
    if (decision !== "KEEP" && decision !== "SKIP")
      throw new Error("Import review incomplete");
    if (decision === "SKIP" || row.duplicate) {
      skipped++;
      continue;
    }
    keep.push(row);
  }
  const sourceIds = keep
    .filter((row) => row.sourceId !== null)
    .map((row) => csvSourceIdentity(batch.fileChecksum, row));
  const existing = sourceIds.length
    ? await tx.$queryRaw<
        StagedSource[]
      >`SELECT "sourceId","sourceHash","batchState" FROM app.import_source_identities(${sourceIds}::text[])`
    : [];
  const bySource = new Map(existing.map((row) => [row.sourceId, row]));
  const inserts: Prisma.TransactionCreateManyInput[] = [];
  const revisions: Prisma.TransactionRevisionCreateManyInput[] = [];
  for (const row of keep) {
    const sourceId = csvSourceIdentity(batch.fileChecksum, row);
    const previous = bySource.get(sourceId);
    if (previous) {
      if (
        previous.sourceHash !== row.sourceHash ||
        previous.batchState !== "COMMITTED"
      ) {
        await tx.importBatch.update({
          where: { id: context.batchId },
          select: { id: true },
          data: {
            state: "FAILED",
            failureCode: "SOURCE_CONFLICT",
            version: { increment: 1 },
          },
        });
        return;
      }
      skipped++;
      continue;
    }
    const id = randomUUID();
    inserts.push({
      id,
      householdId: context.householdId,
      accountId: context.accountId,
      sourceNamespace: "CSV",
      sourceId,
      sourceHash: row.sourceHash,
      fingerprint: row.fingerprint,
      amountMinor: BigInt(row.money.amountMinor),
      currency: row.money.currency,
      bookedDate: new Date(row.bookedDate),
      description: row.description,
      originImportBatchId: context.batchId,
      csvRowNumber: row.rowNumber,
    });
    revisions.push({
      id: randomUUID(),
      householdId: context.householdId,
      accountId: context.accountId,
      transactionId: id,
      actorMembershipId: context.membershipId,
      version: 1,
      kind: "CREATED",
      data: {
        bookedDate: row.bookedDate,
        money: row.money,
        description: row.description,
        source: "CSV",
      },
    });
    bySource.set(sourceId, {
      sourceId,
      sourceHash: row.sourceHash,
      batchState: "COMMITTED",
    });
  }
  if (inserts.length) {
    await tx.transaction.createMany({ data: inserts });
    await tx.transactionRevision.createMany({ data: revisions });
  }
  const processedRows = offset + slice.length;
  const committedRows = batch.committedRows + inserts.length;
  const skippedRows = batch.skippedRows + skipped;
  await tx.importBatch.update({
    where: { id: context.batchId },
    select: { id: true },
    data: {
      processedRows,
      committedRows,
      skippedRows,
      version: { increment: 1 },
    },
  });
  if (processedRows >= batch.totalRows) {
    await publish(tx, context, committedRows, skippedRows);
  } else {
    await tx.job.create({
      data: {
        householdId: context.householdId,
        type: "csv.commit",
        resourceId: context.batchId,
        idempotencyKey: `${context.batchId}:commit:${processedRows}`,
        payload: { offset: processedRows },
      },
    });
  }
}

export async function restoreImport(
  tx: Prisma.TransactionClient,
  context: ImportJobContext,
): Promise<void> {
  const batch = await tx.importBatch.findUniqueOrThrow({
    where: { id: context.batchId },
    select: {
      state: true,
      committedRows: true,
      skippedRows: true,
      committedAt: true,
      rolledBackAt: true,
    },
  });
  if (batch.state === "COMMITTED") return;
  if (
    (batch.state !== "COMMITTING" && batch.state !== "ROLLED_BACK") ||
    !batch.committedAt ||
    !batch.rolledBackAt
  )
    throw new Error("Import restore unavailable");
  await publish(
    tx,
    context,
    batch.committedRows,
    batch.skippedRows,
    batch.committedAt,
  );
}
