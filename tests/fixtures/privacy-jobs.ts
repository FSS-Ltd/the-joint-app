import { expect } from "@playwright/test";
import { JobsRepository } from "../../packages/database/dist/jobs.repository.js";
import { createImportHandlers } from "../../apps/worker/src/imports/handlers.js";
import { createExportHandlers } from "../../apps/worker/src/handlers/export.handler.js";
import { runtime, importKey } from "./privacy-browser.js";

export async function progressPrivacyJob(
  householdId: string,
  resourceId: string,
): Promise<void> {
  const handlers = {
    ...createImportHandlers(importKey),
    ...createExportHandlers(importKey),
  };
  const jobs = new JobsRepository(runtime);
  for (let attempt = 0; attempt < 20; attempt++) {
    const job = await runtime.job.findFirst({
      where: { householdId, resourceId, state: "QUEUED" },
      orderBy: { createdAt: "asc" },
    });
    if (!job) return;
    const lease = await jobs.claim(
      `browser-privacy-${householdId}`,
      Object.keys(handlers),
      5000,
      job.id,
    );
    if (!lease) throw new Error("Expected fixture's queued lease");
    const handler = handlers[lease.type];
    if (!handler) throw new Error("Unexpected privacy worker type");
    expect(await jobs.complete(lease, (tx) => handler(lease, tx), 5000)).toBe(
      true,
    );
  }
  throw new Error("Privacy job exceeded bounded fixture work");
}
