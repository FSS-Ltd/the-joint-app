import { workerEnvironmentSchema, readEnvironment } from "@joint/contracts";
import { randomUUID } from "node:crypto";
import { createOrm } from "@joint/database/client";
import { JobsRepository } from "@joint/database/jobs";
import { runJobs } from "./job-runner.js";
import { createDatabase } from "@joint/database";
async function main(): Promise<void> {
  const env = readEnvironment(workerEnvironmentSchema, process.env);
  const database = createDatabase(env.DATABASE_URL, env.DATABASE_TIMEOUT_MS);
  const orm = createOrm(env.DATABASE_URL);
  const jobs = new JobsRepository(orm);
  const owner = randomUUID();
  const abort = new AbortController();
  let active: Promise<void> = Promise.resolve();
  let stopping = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const check = async (): Promise<void> => {
    try {
      const ready = await database.ready();
      // Real import handlers are registered in Task 1.4; unknown jobs stay queued.
      if (ready && !stopping)
        await runJobs(
          jobs,
          {},
          { owner, maxJobs: 10, budgetMs: 2000, signal: abort.signal },
        );
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
