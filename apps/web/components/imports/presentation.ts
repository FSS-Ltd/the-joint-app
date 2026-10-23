import type { ImportBatchResponse, CsvRejectCode } from "@joint/contracts";
export const importStateLabel = (state: ImportBatchResponse["state"]): string =>
  ({
    QUEUED: "Queued",
    PREVIEWING: "Preparing preview",
    READY: "Ready for review",
    COMMITTING: "Import in progress",
    COMMITTED: "Imported",
    ROLLED_BACK: "Rolled back",
    FAILED: "Import could not complete",
    EXPIRED: "Preview expired",
  })[state];
export const rejectLabels: Record<CsvRejectCode, string> = {
  COLUMN_COUNT: "The number of columns does not match the header.",
  INVALID_DATE: "The date does not match the chosen format.",
  FUTURE_DATE: "The booked date is in the future.",
  INVALID_AMOUNT: "The amount is not valid.",
  AMBIGUOUS_AMOUNT: "The amount is ambiguous under the chosen conventions.",
  UNSUPPORTED_CURRENCY: "Only GBP is supported.",
  INVALID_DESCRIPTION: "The description is missing or too long.",
  INVALID_SOURCE_ID: "The source ID is not valid.",
  SOURCE_CONFLICT:
    "This source ID already exists with different financial fields.",
  DUPLICATE_SOURCE_ID: "This file repeats a stable source ID.",
};
