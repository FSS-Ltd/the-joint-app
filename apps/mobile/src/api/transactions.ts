import {
  idempotencyKeySchema,
  transactionAnnotationSchema,
  transactionCreateSchema,
  transactionListQuerySchema,
  transactionListSchema,
  transactionPatchSchema,
  transactionSchema,
  transactionSplitsSchema,
  transferConfirmSchema,
  transferRemoveSchema,
  transferResultSchema,
  type ClassificationKind,
  type TransactionResponse,
} from "@joint/contracts";
import type { NativeTransport } from "./types";

/** Activity filters use the parsed (boolean) uncategorized form. */
export interface ActivityQuery {
  readonly accountId: string;
  readonly limit?: number;
  readonly cursor?: string;
  readonly month?: string;
  readonly search?: string;
  readonly category?: string;
  readonly uncategorized?: boolean;
  readonly classificationKind?: ClassificationKind;
}

function collection(householdId: string): string {
  return `households/${idempotencyKeySchema.parse(householdId)}/transactions`;
}
function transfers(householdId: string): string {
  return `households/${idempotencyKeySchema.parse(householdId)}/transfers`;
}
function item(householdId: string, id: string): string {
  return `${collection(householdId)}/${idempotencyKeySchema.parse(id)}`;
}

export function createTransactionsApi(transport: NativeTransport) {
  return {
    list(
      householdId: string,
      query: ActivityQuery,
      signal: AbortSignal,
    ): Promise<{ items: TransactionResponse[]; nextCursor: string | null }> {
      const path = collection(householdId);
      const input = transactionListQuerySchema.parse({
        ...query,
        ...(query.uncategorized === undefined
          ? {}
          : { uncategorized: query.uncategorized ? "true" : "false" }),
      });
      const search = new URLSearchParams();
      for (const [key, value] of Object.entries(input))
        if (value !== undefined) search.set(key, String(value));
      return transport.request(
        `${path}?${search.toString()}`,
        transactionListSchema,
        {
          method: "GET",
          signal,
        },
      );
    },
    read(
      householdId: string,
      id: string,
      signal: AbortSignal,
    ): Promise<TransactionResponse> {
      return transport.request(item(householdId, id), transactionSchema, {
        method: "GET",
        signal,
      });
    },
    create(
      householdId: string,
      input: unknown,
      idempotencyKey: string,
      signal: AbortSignal,
    ): Promise<TransactionResponse> {
      return transport.request(collection(householdId), transactionSchema, {
        method: "POST",
        body: transactionCreateSchema.parse(input),
        idempotencyKey,
        signal,
      });
    },
    patch(
      householdId: string,
      id: string,
      input: unknown,
      version: number,
      signal: AbortSignal,
    ): Promise<TransactionResponse> {
      return transport.request(item(householdId, id), transactionSchema, {
        method: "PATCH",
        body: transactionPatchSchema.parse(input),
        version,
        signal,
      });
    },
    annotate(
      householdId: string,
      id: string,
      input: unknown,
      version: number,
      signal: AbortSignal,
    ): Promise<TransactionResponse> {
      return transport.request(
        `${item(householdId, id)}/annotation`,
        transactionSchema,
        {
          method: "PATCH",
          body: transactionAnnotationSchema.parse(input),
          version,
          signal,
        },
      );
    },
    replaceSplits(
      householdId: string,
      id: string,
      input: unknown,
      version: number,
      signal: AbortSignal,
    ): Promise<TransactionResponse> {
      return transport.request(
        `${item(householdId, id)}/splits`,
        transactionSchema,
        {
          method: "PUT",
          body: transactionSplitsSchema.parse(input),
          version,
          signal,
        },
      );
    },
    confirmTransfer(
      householdId: string,
      input: unknown,
      idempotencyKey: string,
      signal: AbortSignal,
    ) {
      return transport.request(
        `${transfers(householdId)}/confirm`,
        transferResultSchema,
        {
          method: "POST",
          body: transferConfirmSchema.parse(input),
          idempotencyKey,
          signal,
        },
      );
    },
    readTransfer(householdId: string, id: string, signal: AbortSignal) {
      return transport.request(
        `${transfers(householdId)}/${idempotencyKeySchema.parse(id)}`,
        transferResultSchema,
        { method: "GET", signal },
      );
    },
    removeTransfer(
      householdId: string,
      id: string,
      input: unknown,
      signal: AbortSignal,
    ) {
      return transport.request(
        `${transfers(householdId)}/${idempotencyKeySchema.parse(id)}`,
        transferResultSchema,
        {
          method: "DELETE",
          body: transferRemoveSchema.parse(input),
          signal,
        },
      );
    },
  };
}
export type TransactionsApi = ReturnType<typeof createTransactionsApi>;
