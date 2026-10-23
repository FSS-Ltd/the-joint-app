import { randomInt } from "node:crypto";
import { performance } from "node:perf_hooks";
import type { Prisma } from "@joint/database/client";
import type { JobLease, JobsRepository } from "@joint/database/jobs";
export type JobHandler = (
  lease: JobLease,
  transaction: Prisma.TransactionClient,
) => Promise<void>;
export interface RunnerOptions {
  owner: string;
  maxJobs: number;
  budgetMs: number;
  signal?: AbortSignal;
}
export async function runJobs(
  jobs: JobsRepository,
  handlers: Readonly<Record<string, JobHandler>>,
  options: RunnerOptions,
): Promise<{ succeeded: number; failed: number }> {
  if (
    !Number.isInteger(options.maxJobs) ||
    options.maxJobs < 1 ||
    options.maxJobs > 100 ||
    !Number.isInteger(options.budgetMs) ||
    options.budgetMs < 100 ||
    options.budgetMs > 60_000
  )
    throw new Error(
      "Runner requires 1–100 jobs and a 100–60000 millisecond budget",
    );
  const deadline = performance.now() + options.budgetMs;
  const result = { succeeded: 0, failed: 0 };
  for (
    let count = 0;
    count < options.maxJobs && !options.signal?.aborted;
    count++
  ) {
    const remaining = Math.floor(deadline - performance.now());
    if (remaining < 100) break;
    const lease = await jobs.claim(
      options.owner,
      Object.keys(handlers),
      Math.min(remaining, 5000),
    );
    if (!lease) break;
    const handler = handlers[lease.type];
    if (!handler) throw new Error("Claimed job has no registered handler");
    try {
      if (
        await jobs.complete(
          lease,
          (tx) => handler(lease, tx),
          Math.max(1, Math.floor(deadline - performance.now())),
        )
      )
        result.succeeded++;
    } catch {
      // Handler errors may contain financial payloads; persist state, never text.
      const ceiling = Math.min(300, 2 ** Math.min(lease.attempt, 8));
      await jobs.fail(lease, randomInt(1, ceiling + 1));
      result.failed++;
    }
  }
  return result;
}
