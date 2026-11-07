import type { ImportBatchResponse } from "@joint/contracts";

export type ImportAction = "rollback" | "restore" | "original";
/** Server-granted rights only; the server re-checks lineage, state and version. */
export function actionAllowed(
  batch: ImportBatchResponse,
  action: ImportAction,
): boolean {
  switch (action) {
    case "rollback":
      return batch.permissions.canRollback;
    case "restore":
      return batch.permissions.canRestore;
    case "original":
      // A queued, previewing, ready or failed batch may still need the file.
      return (
        batch.permissions.canDeleteOriginal &&
        batch.originalAvailable &&
        (batch.state === "COMMITTED" || batch.state === "ROLLED_BACK")
      );
  }
}
