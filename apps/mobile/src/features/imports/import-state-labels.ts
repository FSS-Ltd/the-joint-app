import type { ImportBatchResponse } from "@joint/contracts";

export const stateLabels: Record<ImportBatchResponse["state"], string> = {
  QUEUED: "Waiting to start",
  PREVIEWING: "Checking rows",
  READY: "Preview ready",
  COMMITTING: "Adding rows to activity",
  COMMITTED: "Imported",
  ROLLED_BACK: "Rolled back",
  FAILED: "Failed",
  EXPIRED: "Expired",
};
