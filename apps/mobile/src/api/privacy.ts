import {
  accountListQuerySchema,
  accountListSchema,
  accountSchema,
  deletionReceiptSchema,
  deletionRequestSchema,
  deletionStatusSchema,
  entitlementResponseSchema,
  exportScopeSchema,
  exportStatusSchema,
  idempotencyKeySchema,
  leaveHouseholdResponseSchema,
  leaveHouseholdSchema,
  transactionListSchema,
  type AccountResponse,
  type DeletionReceipt,
  type DeletionStatus,
  type EntitlementResponse,
  type ExportStatus,
  type StatusSubscription,
  type TransactionResponse,
} from "@joint/contracts";
import type { NativeStatusConnection, NativeTransport } from "./types";

export type ArchivePage = { limit?: number; cursor?: string };

function household(householdId: string): string {
  return `households/${idempotencyKeySchema.parse(householdId)}`;
}

function pageQuery(page: ArchivePage = {}): string {
  const parsed = accountListQuerySchema.parse(page);
  const query = new URLSearchParams({ limit: String(parsed.limit) });
  if (parsed.cursor !== undefined) query.set("cursor", parsed.cursor);
  return query.toString();
}

export function createPrivacyApi(transport: NativeTransport) {
  return {
    requestExport(
      householdId: string,
      accountIds: readonly string[],
      signal: AbortSignal,
    ): Promise<ExportStatus> {
      const body = exportScopeSchema.parse({ accountIds: [...accountIds] });
      return transport.request(
        `${household(householdId)}/exports`,
        exportStatusSchema,
        {
          method: "POST",
          signal,
          body,
        },
      );
    },
    readExportStatus(
      householdId: string,
      exportId: string,
      signal: AbortSignal,
    ): Promise<ExportStatus> {
      return transport.request(
        `${household(householdId)}/exports/${idempotencyKeySchema.parse(exportId)}`,
        exportStatusSchema,
        {
          method: "GET",
          signal,
        },
      );
    },
    downloadExport(
      householdId: string,
      exportId: string,
      signal: AbortSignal,
    ): Promise<Uint8Array<ArrayBuffer>> {
      if (!transport.downloadCsv)
        throw new Error("CSV download is not configured on this transport.");
      return transport.downloadCsv(
        `${household(householdId)}/exports/${idempotencyKeySchema.parse(exportId)}/download`,
        signal,
      );
    },
    listArchiveAccounts(
      page: ArchivePage,
      signal: AbortSignal,
    ): Promise<{ items: AccountResponse[]; nextCursor: string | null }> {
      return transport.request(
        `me/archive/accounts?${pageQuery(page)}`,
        accountListSchema,
        {
          method: "GET",
          signal,
        },
      );
    },
    readArchiveAccount(
      accountId: string,
      signal: AbortSignal,
    ): Promise<AccountResponse> {
      return transport.request(
        `me/archive/accounts/${idempotencyKeySchema.parse(accountId)}`,
        accountSchema,
        {
          method: "GET",
          signal,
        },
      );
    },
    listArchiveTransactions(
      accountId: string,
      page: ArchivePage,
      signal: AbortSignal,
    ): Promise<{ items: TransactionResponse[]; nextCursor: string | null }> {
      return transport.request(
        `me/archive/accounts/${idempotencyKeySchema.parse(accountId)}/transactions?${pageQuery(page)}`,
        transactionListSchema,
        {
          method: "GET",
          signal,
        },
      );
    },
    requestArchiveExport(
      accountIds: readonly string[],
      signal: AbortSignal,
    ): Promise<ExportStatus> {
      const body = exportScopeSchema.parse({ accountIds: [...accountIds] });
      return transport.request("me/archive/exports", exportStatusSchema, {
        method: "POST",
        signal,
        body,
      });
    },
    readArchiveExportStatus(
      exportId: string,
      signal: AbortSignal,
    ): Promise<ExportStatus> {
      return transport.request(
        `me/archive/exports/${idempotencyKeySchema.parse(exportId)}`,
        exportStatusSchema,
        {
          method: "GET",
          signal,
        },
      );
    },
    downloadArchiveExport(
      exportId: string,
      signal: AbortSignal,
    ): Promise<Uint8Array<ArrayBuffer>> {
      if (!transport.downloadCsv)
        throw new Error("CSV download is not configured on this transport.");
      return transport.downloadCsv(
        `me/archive/exports/${idempotencyKeySchema.parse(exportId)}/download`,
        signal,
      );
    },
    readEntitlements(
      householdId: string,
      signal: AbortSignal,
    ): Promise<EntitlementResponse> {
      return transport.request(
        `${household(householdId)}/entitlements`,
        entitlementResponseSchema,
        {
          method: "GET",
          signal,
        },
      );
    },
    leaveHousehold(
      householdId: string,
      requestId: string,
      signal: AbortSignal,
    ): Promise<{ left: true }> {
      const body = leaveHouseholdSchema.parse({
        confirmation: "LEAVE_HOUSEHOLD",
        requestId,
      });
      return transport.request(
        `${household(householdId)}/memberships/me`,
        leaveHouseholdResponseSchema,
        {
          method: "DELETE",
          signal,
          body,
        },
      );
    },
    requestDeletion(
      requestId: string,
      signal: AbortSignal,
    ): Promise<DeletionReceipt> {
      const body = deletionRequestSchema.parse({
        confirmation: "DELETE_MY_ACCOUNT",
        requestId,
      });
      return transport.request(
        "privacy/deletion-requests",
        deletionReceiptSchema,
        {
          method: "POST",
          signal,
          body,
        },
      );
    },
    readDeletionStatus(
      id: string,
      statusToken: string,
      signal: AbortSignal,
    ): Promise<DeletionStatus> {
      const parsedId = idempotencyKeySchema.parse(id);
      return transport.request(
        `privacy/deletion-requests/${parsedId}`,
        deletionStatusSchema,
        {
          method: "GET",
          signal,
          authorization: {
            kind: "deletion-receipt",
            token: statusToken,
          },
        },
      );
    },
    openStatus(
      selector: StatusSubscription,
      signal: AbortSignal,
      statusToken?: string,
    ): Promise<NativeStatusConnection> {
      return transport.openStatus(
        selector,
        signal,
        statusToken
          ? { kind: "deletion-receipt", token: statusToken }
          : undefined,
      );
    },
  };
}

export type PrivacyApi = ReturnType<typeof createPrivacyApi>;
