import {
  workerEnvironmentSchema,
  importEnvironmentSchema,
  privacyEnvironmentSchema,
  privacyWorkerEnvironmentSchema,
  readEnvironment,
} from "@joint/contracts";
import { randomUUID } from "node:crypto";
import { createOrm } from "@joint/database/client";
import { JobsRepository } from "@joint/database/jobs";
import { runJobs } from "./job-runner.js";
import { createDatabase } from "@joint/database";
import { createImportHandlers } from "./imports/handlers.js";
import { maintainImports } from "./import-maintenance.js";
import { createExportHandlers } from "./handlers/export.handler.js";
import { maintainExports } from "@joint/database/export-maintenance";
import { DeletionRepository } from "@joint/database/deletion";
import { PrivacyJournal } from "@joint/database/privacy-journal";
import { LocalAuthAdmin } from "./privacy/local-auth-admin.js";
import { processDeletion } from "./privacy/process-deletion.js";
async function main(): Promise<void> {
  const env = readEnvironment(workerEnvironmentSchema, process.env);
  const database = createDatabase(env.DATABASE_URL, env.DATABASE_TIMEOUT_MS);
  const orm = createOrm(env.DATABASE_URL);
  const jobs = new JobsRepository(orm);
  const privacy =
    process.env.PRIVACY_AUTH_URL === undefined &&
    process.env.PRIVACY_AUTH_ADMIN_KEY === undefined
      ? undefined
      : {
          ...readEnvironment(privacyWorkerEnvironmentSchema, process.env),
          ...readEnvironment(privacyEnvironmentSchema, process.env),
        };
  const deletion = privacy
    ? {
        repository: new DeletionRepository(orm),
        provider: new LocalAuthAdmin(
          privacy.PRIVACY_AUTH_URL,
          privacy.PRIVACY_AUTH_ADMIN_KEY,
        ),
        journal: new PrivacyJournal(privacy.PRIVACY_JOURNAL_PATH),
      }
    : undefined;
  const handlers =
    process.env.IMPORT_DATA_KEY === undefined
      ? {}
      : {
          ...createImportHandlers(
            readEnvironment(importEnvironmentSchema, process.env)
              .IMPORT_DATA_KEY,
          ),
          ...createExportHandlers(
            readEnvironment(importEnvironmentSchema, process.env)
              .IMPORT_DATA_KEY,
          ),
        };
  const owner = randomUUID();
  const abort = new AbortController();
  let active: Promise<void> = Promise.resolve();
  let stopping = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const check = async (): Promise<void> => {
    try {
      const ready = await database.ready();
      if (ready && !stopping) {
        await maintainImports(orm);
        await maintainExports(orm);
        if (deletion && !abort.signal.aborted)
          await processDeletion(
            deletion.repository,
            deletion.provider,
            deletion.journal,
            abort.signal,
          );
        await runJobs(jobs, handlers, {
          owner,
          maxJobs: 10,
          budgetMs: 5000,
          signal: abort.signal,
        });
      }
      process.stdout.write(
        `Worker database ${ready ? "ready" : "unavailable"}\n`,
      );
    } catch {
      process.stderr.write("Worker cycle unavailable\n");
    } finally {
      if (!stopping)
        timer = setTimeout(() => {
          active = check();
        }, env.WORKER_INTERVAL_MS);
    }
  };
  const close = async (): Promise<void> => {
    if (stopping) return;
    stopping = true;
    abort.abort();
    clearTimeout(timer);
    await active;
    await database.close();
    await orm.$disconnect();
  };
  process.once("SIGINT", () => {
    void close();
  });
  process.once("SIGTERM", () => {
    void close();
  });
  active = check();
  await active;
}
main().catch((error) => {
  process.stderr.write(
    error instanceof Error &&
      error.message.startsWith("Invalid environment fields:")
      ? `${error.message}\n`
      : "Worker startup failed\n",
  );
  process.exitCode = 1;
});
