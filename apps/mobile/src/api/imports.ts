import {
  csvInspectionSchema,
  csvMappingSchema,
  idempotencyKeySchema,
  importBatchSchema,
  importCommitSchema,
  importJobResultSchema,
  importListQuerySchema,
  importListSchema,
  importReviewSchema,
  importRowsQuerySchema,
  importRowsSchema,
  quotedVersionSchema,
} from "@joint/contracts";
import type { NativeTransport } from "./types";

export interface ImportListQuery {
  readonly accountId: string;
  readonly limit?: number;
  readonly cursor?: string;
}
export interface ImportRowsQuery {
  readonly offset: number;
  readonly limit: number;
  readonly filter: "ALL" | "REVIEW" | "REJECTED";
}
function collection(householdId: string): string {
  return `households/${idempotencyKeySchema.parse(householdId)}/imports`;
}
function item(householdId: string, id: string): string {
  return `${collection(householdId)}/${idempotencyKeySchema.parse(id)}`;
}
function version(value: number): number {
  return quotedVersionSchema.parse(`"${value}"`);
}

/** Thin adapters over the existing imports routes; the server is the only CSV parser. */
export function createImportsApi(transport: NativeTransport) {
  return {
    inspect(
      householdId: string,
      accountId: string,
      bytes: Uint8Array<ArrayBuffer>,
      signal: AbortSignal,
    ) {
      return transport.request(
        `${collection(householdId)}/inspect?suggestMapping=1`,
        csvInspectionSchema,
        { method: "POST", csv: { bytes, accountId }, signal },
      );
    },
    /** Hold one idempotency key per (file, mapping) attempt; mint a new key when either changes. */
    preview(
      householdId: string,
      accountId: string,
      bytes: Uint8Array<ArrayBuffer>,
      mapping: unknown,
      idempotencyKey: string,
      signal: AbortSignal,
    ) {
      return transport.request(
        `${collection(householdId)}/preview`,
        importJobResultSchema,
        {
          method: "POST",
          csv: {
            bytes,
            accountId,
            mapping: encodeURIComponent(
              JSON.stringify(csvMappingSchema.parse(mapping)),
            ),
          },
          idempotencyKey: idempotencyKeySchema.parse(idempotencyKey),
          signal,
        },
      );
    },
    list(householdId: string, query: ImportListQuery, signal: AbortSignal) {
      const input = importListQuerySchema.parse(query);
      const search = new URLSearchParams({
        accountId: input.accountId,
        limit: String(input.limit),
      });
      if (input.cursor !== undefined) search.set("cursor", input.cursor);
      return transport.request(
        `${collection(householdId)}?${search.toString()}`,
        importListSchema,
        { method: "GET", signal },
      );
    },
    read(householdId: string, id: string, signal: AbortSignal) {
      return transport.request(item(householdId, id), importBatchSchema, {
        method: "GET",
        signal,
      });
    },
    rows(
      householdId: string,
      id: string,
      query: ImportRowsQuery,
      signal: AbortSignal,
    ) {
      const input = importRowsQuerySchema.parse(query);
      const search = new URLSearchParams({
        offset: String(input.offset),
        limit: String(input.limit),
        filter: input.filter,
      });
      return transport.request(
        `${item(householdId, id)}/rows?${search.toString()}`,
        importRowsSchema,
        { method: "GET", signal },
      );
    },
    review(
      householdId: string,
      id: string,
      input: unknown,
      batchVersion: number,
      signal: AbortSignal,
    ) {
      return transport.request(
        `${item(householdId, id)}/review`,
        importBatchSchema,
        {
          method: "PATCH",
          body: importReviewSchema.parse(input),
          version: version(batchVersion),
          signal,
        },
      );
    },
    commit(
      householdId: string,
      id: string,
      input: unknown,
      idempotencyKey: string,
      batchVersion: number,
      signal: AbortSignal,
    ) {
      return transport.request(
        `${item(householdId, id)}/commit`,
        importJobResultSchema,
        {
          method: "POST",
          body: importCommitSchema.parse(input),
          idempotencyKey: idempotencyKeySchema.parse(idempotencyKey),
          version: version(batchVersion),
          signal,
        },
      );
    },
    rollback(
      householdId: string,
      id: string,
      batchVersion: number,
      signal: AbortSignal,
    ) {
      return transport.request(item(householdId, id), importBatchSchema, {
        method: "DELETE",
        version: version(batchVersion),
        signal,
      });
    },
    deleteOriginal(
      householdId: string,
      id: string,
      batchVersion: number,
      signal: AbortSignal,
    ) {
      return transport.request(
        `${item(householdId, id)}/original`,
        importBatchSchema,
        { method: "DELETE", version: version(batchVersion), signal },
      );
    },
  };
}
export type ImportsApi = ReturnType<typeof createImportsApi>;
