import { DataVault } from "@joint/database/data-vault";
import type { JobHandler } from "../job-runner.js";
import {
  encodeExportRow,
  exportCsvHeader,
  type ExportCsvRow,
} from "../exports/csv.js";

interface ExportPage {
  exportId: string;
  sequence: number;
  cursor: string;
  nextCursor: string;
  records: ExportCsvRow[];
}

/** Runs inside the existing five-second leased transaction, including continuation. */
export function createExportHandlers(
  key: string,
): Readonly<Record<string, JobHandler>> {
  const vault = new DataVault(key);
  return {
    "csv.export": async (lease, tx) => {
      const [page] = await tx.$queryRaw<
        ExportPage[]
      >`SELECT * FROM app.export_job_page(${lease.id}::uuid,${lease.leaseToken}::uuid)`;
      if (!page) return;
      const csv =
        (page.sequence === 0 ? exportCsvHeader : "") +
        page.records.map(encodeExportRow).join("");
      const ciphertext = vault.seal(
        Buffer.from(csv),
        `export:${page.exportId}:chunk:${page.sequence}`,
      );
      await tx.$queryRaw`SELECT app.store_export_chunk(${lease.id}::uuid,${lease.leaseToken}::uuid,${page.sequence},${page.nextCursor},${ciphertext},${page.records.length < 500})`;
    },
  };
}
