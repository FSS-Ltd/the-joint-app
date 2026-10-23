import {
  csvMappingSchema,
  type NormalizedCsvRow,
  type ValidCsvRow,
} from "@joint/contracts";
import type { Prisma } from "@joint/database/client";
import type { DataVault } from "@joint/database/data-vault";
import { normalizeCsv } from "@joint/domain/csv";
import { createHash } from "node:crypto";

type ExistingSource = {
  sourceId: string;
  sourceHash: string;
  batchState: string;
};
type ExistingOverlap = { fingerprint: string };

export function importObjectContext(batch: {
  id: string;
  householdId: string;
  accountId: string;
}): string {
  return `import:${batch.householdId}:${batch.accountId}:${batch.id}`;
}
export function csvSourceIdentity(
  checksum: string,
  row: Pick<ValidCsvRow, "sourceId" | "rowNumber">,
): string {
  return row.sourceId === null
    ? `file:${checksum}:${row.rowNumber}`
    : `id:${createHash("sha256").update(row.sourceId).digest("hex")}`;
}

/** Source identity, not financial resemblance, decides whether a row is a duplicate. */
async function enrichRows(
  tx: Prisma.TransactionClient,
  accountId: string,
  checksum: string,
  rows: NormalizedCsvRow[],
): Promise<NormalizedCsvRow[]> {
  const valid = rows.filter(
    (row): row is ValidCsvRow => row.status === "VALID",
  );
  if (!valid.length) return rows;
  // File-row identities are reserved by the unique account/file checksum, and cannot collide with hashed explicit IDs.
  const sourceIds = [
    ...new Set(
      valid
        .filter((row) => row.sourceId !== null)
        .map((row) => csvSourceIdentity(checksum, row)),
    ),
  ];
  const sources = sourceIds.length
    ? await tx.$queryRaw<
        ExistingSource[]
      >`SELECT "sourceId", "sourceHash", "batchState" FROM app.import_source_identities(${sourceIds}::text[])`
    : [];
  const overlaps = await tx.$queryRaw<
    ExistingOverlap[]
  >`SELECT DISTINCT fingerprint FROM app.import_overlap_candidates(${accountId}::uuid, ${[...new Set(valid.map((row) => row.fingerprint))]}::text[])`;
  const sourceHashes = new Map(
    sources.map((row) => [
      row.sourceId,
      { sourceHash: row.sourceHash, batchState: row.batchState },
    ]),
  );
  const candidates = new Set(overlaps.map((row) => row.fingerprint));
  return rows.map((row): NormalizedCsvRow => {
    if (row.status === "REJECTED") return row;
    const sourceId = csvSourceIdentity(checksum, row);
    const existing = sourceHashes.get(sourceId);
    if (existing !== undefined) {
      if (
        existing.sourceHash !== row.sourceHash ||
        existing.batchState !== "COMMITTED"
      )
        return {
          rowNumber: row.rowNumber,
          status: "REJECTED",
          reason: "SOURCE_CONFLICT",
        };
      return { ...row, decision: "SKIP", duplicate: true };
    }
    if (row.sourceId !== null)
      sourceHashes.set(sourceId, {
        sourceHash: row.sourceHash,
        batchState: "COMMITTED",
      });
    const hasOverlap = candidates.has(row.fingerprint);
    return {
      ...row,
      decision: hasOverlap ? "REVIEW" : "KEEP",
      // Candidate details are hydrated only for the bounded owner review page.
      overlaps: [],
    };
  });
}

export async function previewImport(
  tx: Prisma.TransactionClient,
  batchId: string,
  vault: DataVault,
): Promise<void> {
  const batch = await tx.importBatch.findUniqueOrThrow({
    where: { id: batchId },
    select: {
      id: true,
      householdId: true,
      accountId: true,
      state: true,
      object: { select: { ciphertext: true } },
      previewExpiresAt: true,
      mapping: true,
      fileChecksum: true,
    },
  });
  if (batch.state === "READY" || batch.state === "COMMITTED") return;
  if (batch.state !== "QUEUED" && batch.state !== "PREVIEWING")
    throw new Error("Import state unavailable");
  if (
    !batch.object?.ciphertext ||
    batch.previewExpiresAt.getTime() <= Date.now()
  ) {
    await tx.importBatch.update({
      where: { id: batch.id },
      select: { id: true },
      data: {
        state: "EXPIRED",
        failureCode: "ORIGINAL_EXPIRED",
        version: { increment: 1 },
      },
    });
    return;
  }
  let normalized: NormalizedCsvRow[];
  try {
    const bytes = vault.open(
      batch.object.ciphertext,
      importObjectContext(batch),
    );
    if (createHash("sha256").update(bytes).digest("hex") !== batch.fileChecksum)
      throw new Error("Stored import data unavailable");
    normalized = (
      await normalizeCsv(bytes, csvMappingSchema.parse(batch.mapping))
    ).rows;
  } catch {
    await tx.importBatch.update({
      where: { id: batch.id },
      select: { id: true },
      data: {
        state: "FAILED",
        failureCode: "CSV_UNAVAILABLE",
        version: { increment: 1 },
      },
    });
    return;
  }
  const rows = await enrichRows(
    tx,
    batch.accountId,
    batch.fileChecksum,
    normalized,
  );
  const valid = rows.filter(
    (row): row is ValidCsvRow => row.status === "VALID",
  );
  const [dataset] = await tx.$queryRaw<
    { version: number }[]
  >`SELECT app.import_account_version(${batch.id}::uuid) AS version`;
  if (!dataset) throw new Error("Import account unavailable");
  await tx.importBatch.update({
    where: { id: batch.id },
    select: { id: true },
    data: {
      datasetVersion: dataset.version,
      preview: rows,
      state: "READY",
      version: { increment: 1 },
      totalRows: rows.length,
      processedRows: rows.length,
      validRows: valid.length,
      rejectedRows: rows.length - valid.length,
      overlapRows: valid.filter((row) => row.decision === "REVIEW").length,
      duplicateRows: valid.filter((row) => row.duplicate).length,
      skippedRows: valid.filter((row) => row.decision === "SKIP").length,
      failureCode: null,
    },
  });
}
