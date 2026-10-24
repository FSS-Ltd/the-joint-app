import {
  workerEnvironmentSchema,
  importEnvironmentSchema,
  privacyEnvironmentSchema,
  readEnvironment,
} from "@joint/contracts";
import { randomUUID } from "node:crypto";
import { createOrm } from "@joint/database/client";
import { JobsRepository } from "@joint/database/jobs";
import { runJobs } from "./job-runner.js";
import { createWorkerNotifications } from "@joint/database/worker-notifications";
import { workerNextDelay } from "@joint/database/worker-deadlines";
import { createWorkerScheduler } from "./scheduler.js";
import { createImportHandlers } from "./imports/handlers.js";
import { maintainImports } from "./import-maintenance.js";
import { createExportHandlers } from "./handlers/export.handler.js";
import { maintainExports } from "@joint/database/export-maintenance";
import { DeletionRepository } from "@joint/database/deletion";
import { PrivacyJournal } from "@joint/database/privacy-journal";
import { createDeletionProvider } from "./privacy/provider.js";
import { processDeletion } from "./privacy/process-deletion.js";
async function main(): Promise<void> {
  const env = readEnvironment(workerEnvironmentSchema, process.env);
  const orm = createOrm(env.DATABASE_URL);
  const jobs = new JobsRepository(orm);
  const provider = createDeletionProvider(process.env);
  const privacy = provider
    ? readEnvironment(privacyEnvironmentSchema, process.env)
    : undefined;
  const deletion =
    privacy && provider
      ? {
          repository: new DeletionRepository(orm),
          provider,
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
  const scheduler = createWorkerScheduler(
    async () => {
      await maintainImports(orm);
      await maintainExports(orm);
      if (deletion && !abort.signal.aborted)
        await processDeletion(
          deletion.repository,
          deletion.provider,
          deletion.journal,
          abort.signal,
        );
      if (abort.signal.aborted) return null;
      await runJobs(jobs, handlers, {
        owner,
        maxJobs: 10,
        budgetMs: 5000,
        signal: abort.signal,
      });
      return workerNextDelay(
        orm,
        Object.keys(handlers),
        deletion !== undefined,
      );
    },
    {
      retryMaxMs: env.WORKER_RETRY_MAX_MS,
      onUnavailable: () => {
        process.stderr.write("Worker cycle unavailable\n");
      },
    },
  );
  const notifications = createWorkerNotifications({
    connectionString: env.DATABASE_URL,
    timeoutMs: env.DATABASE_TIMEOUT_MS,
    retryMaxMs: env.WORKER_RETRY_MAX_MS,
    onReady: () => {
      process.stdout.write("Worker database ready\n");
      scheduler.wake();
    },
    onWake: scheduler.wake,
    onUnavailable: () => {
      process.stderr.write("Worker database unavailable\n");
    },
  });
  let closing: Promise<void> | undefined;
  const close = (): Promise<void> => {
    closing ??= (async () => {
      abort.abort();
      try {
        await notifications.close();
        await scheduler.close();
      } finally {
        await orm.$disconnect();
      }
    })();
    return closing;
  };
  const stop = (): void => {
    void close().catch(() => {
      process.stderr.write("Worker shutdown failed\n");
      process.exitCode = 1;
    });
  };
  process.once("SIGINT", () => {
    stop();
  });
  process.once("SIGTERM", () => {
    stop();
  });
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
