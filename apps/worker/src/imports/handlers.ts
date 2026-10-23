import { DataVault } from "@joint/database/data-vault";
import { withImportJobScope } from "@joint/database/scoped";
import type { JobHandler } from "../job-runner.js";
import { commitImport, restoreImport } from "./commit.js";
import { previewImport } from "./preview.js";

/** The lease is independently checked by PostgreSQL before every financial write. */
export function createImportHandlers(
  key: string,
): Readonly<Record<string, JobHandler>> {
  const vault = new DataVault(key);
  return {
    "csv.preview": (lease, tx) =>
      withImportJobScope(tx, lease, async (scoped, context) =>
        previewImport(scoped, context.batchId, vault),
      ),
    "csv.commit": (lease, tx) =>
      withImportJobScope(tx, lease, async (scoped, context) =>
        commitImport(scoped, context, lease),
      ),
    "csv.restore": (lease, tx) =>
      withImportJobScope(tx, lease, async (scoped, context) =>
        restoreImport(scoped, context),
      ),
  };
}
