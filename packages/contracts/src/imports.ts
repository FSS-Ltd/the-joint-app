import { bookedDateSchema, financialTextSchema } from "./financial-input.js";
import { z } from "zod";
import { moneySchema } from "./accounts.js";

export const MAX_CSV_BYTES = 10 * 1024 * 1024;
export const MAX_CSV_ROWS = 50_000;
const columnIndex = z.number().int().min(0).max(99);
export const csvMappingSchema = z
  .object({
    date: columnIndex,
    description: columnIndex,
    amount: columnIndex.nullable(),
    debit: columnIndex.nullable(),
    credit: columnIndex.nullable(),
    currency: columnIndex.nullable(),
    sourceId: columnIndex.nullable(),
    dateFormat: z.enum(["ISO", "DMY", "MDY"]),
    decimalSeparator: z.enum(["DOT", "COMMA"]),
    amountMode: z.enum(["SIGNED", "DEBIT_CREDIT"]),
    positiveIs: z.enum(["INFLOW", "OUTFLOW"]),
  })
  .strict()
  .refine(
    (value) =>
      value.amountMode === "SIGNED"
        ? value.amount !== null && value.debit === null && value.credit === null
        : value.amount === null &&
          value.debit !== null &&
          value.credit !== null,
    "Choose a single signed amount or separate debit and credit columns",
  )
  .refine((value) => {
    const indexes = [
      value.date,
      value.description,
      value.amount,
      value.debit,
      value.credit,
      value.currency,
      value.sourceId,
    ].filter((index) => index !== null);
    return new Set(indexes).size === indexes.length;
  }, "Each field needs a different column");
export type CsvMapping = z.infer<typeof csvMappingSchema>;
export const csvColumnSchema = z
  .object({ index: columnIndex, label: z.string().min(1).max(128) })
  .strict();
export type CsvColumn = z.infer<typeof csvColumnSchema>;
export const csvInspectionSchema = z
  .object({
    columns: z.array(csvColumnSchema).min(1).max(100),
    rowCount: z.number().int().min(1).max(MAX_CSV_ROWS),
  })
  .strict();
export const csvRejectCodeSchema = z.enum([
  "COLUMN_COUNT",
  "INVALID_DATE",
  "FUTURE_DATE",
  "INVALID_AMOUNT",
  "AMBIGUOUS_AMOUNT",
  "UNSUPPORTED_CURRENCY",
  "INVALID_DESCRIPTION",
  "INVALID_SOURCE_ID",
  "SOURCE_CONFLICT",
  "DUPLICATE_SOURCE_ID",
]);
export type CsvRejectCode = z.infer<typeof csvRejectCodeSchema>;
export const importDecisionSchema = z.enum(["KEEP", "SKIP", "REVIEW"]);
export const overlapCandidateSchema = z
  .object({
    transactionId: z.uuid(),
    bookedDate: bookedDateSchema,
    money: moneySchema,
    description: financialTextSchema.max(500),
  })
  .strict();
export const validCsvRowSchema = z
  .object({
    rowNumber: z.number().int().min(1).max(MAX_CSV_ROWS),
    status: z.literal("VALID"),
    money: moneySchema,
    bookedDate: bookedDateSchema,
    description: financialTextSchema.min(1).max(500),
    sourceId: financialTextSchema.min(1).max(160).nullable(),
    sourceHash: z.string().regex(/^[a-f0-9]{64}$/),
    fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
    decision: importDecisionSchema,
    duplicate: z.boolean(),
    overlaps: z.array(overlapCandidateSchema).max(5),
  })
  .strict();
export const rejectedCsvRowSchema = z
  .object({
    rowNumber: z.number().int().min(1).max(MAX_CSV_ROWS),
    status: z.literal("REJECTED"),
    reason: csvRejectCodeSchema,
  })
  .strict();
export const normalizedCsvRowSchema = z.discriminatedUnion("status", [
  validCsvRowSchema,
  rejectedCsvRowSchema,
]);
export type NormalizedCsvRow = z.infer<typeof normalizedCsvRowSchema>;
export type ValidCsvRow = z.infer<typeof validCsvRowSchema>;
export const importStateSchema = z.enum([
  "QUEUED",
  "PREVIEWING",
  "READY",
  "COMMITTING",
  "COMMITTED",
  "ROLLED_BACK",
  "FAILED",
  "EXPIRED",
]);
export const importBatchSchema = z
  .object({
    id: z.uuid(),
    accountId: z.uuid(),
    state: importStateSchema,
    version: z.number().int().positive(),
    totalRows: z.number().int().nonnegative(),
    processedRows: z.number().int().nonnegative(),
    validRows: z.number().int().nonnegative(),
    rejectedRows: z.number().int().nonnegative(),
    overlapRows: z.number().int().nonnegative(),
    duplicateRows: z.number().int().nonnegative(),
    committedRows: z.number().int().nonnegative(),
    skippedRows: z.number().int().nonnegative(),
    failureCode: z.string().max(80).nullable(),
    createdAt: z.iso.datetime(),
    committedAt: z.iso.datetime().nullable(),
    rolledBackAt: z.iso.datetime().nullable(),
    originalExpiresAt: z.iso.datetime().nullable(),
    originalAvailable: z.boolean(),
    permissions: z
      .object({
        canCommit: z.boolean(),
        canRollback: z.boolean(),
        canRestore: z.boolean(),
        canDeleteOriginal: z.boolean(),
      })
      .strict(),
  })
  .strict();
export type ImportBatchResponse = z.infer<typeof importBatchSchema>;
export const importJobResultSchema = z
  .object({ batch: importBatchSchema, jobId: z.uuid().nullable() })
  .strict();
export const importListSchema = z
  .object({
    items: z.array(importBatchSchema),
    nextCursor: z.string().nullable(),
  })
  .strict();
export const importListQuerySchema = z
  .object({
    accountId: z.uuid(),
    limit: z.coerce.number().int().min(1).max(100).default(50),
    cursor: z.string().min(1).max(2048).optional(),
  })
  .strict();
export const importRowsQuerySchema = z
  .object({
    offset: z.coerce.number().int().min(0).max(MAX_CSV_ROWS).default(0),
    limit: z.coerce.number().int().min(1).max(100).default(100),
    filter: z.enum(["ALL", "REVIEW", "REJECTED"]).default("ALL"),
  })
  .strict();
export const importRowsSchema = z
  .object({
    items: z.array(normalizedCsvRowSchema).max(100),
    nextOffset: z.number().int().nonnegative().nullable(),
  })
  .strict();
export const importReviewSchema = z
  .object({
    decisions: z
      .array(
        z
          .object({
            rowNumber: z.number().int().min(1).max(MAX_CSV_ROWS),
            decision: z.enum(["KEEP", "SKIP"]),
          })
          .strict(),
      )
      .min(1)
      .max(100),
  })
  .strict()
  .refine(
    (value) =>
      new Set(value.decisions.map((row) => row.rowNumber)).size ===
      value.decisions.length,
  );
export const importCommitSchema = z
  .object({ acceptRejectedRows: z.boolean() })
  .strict();
