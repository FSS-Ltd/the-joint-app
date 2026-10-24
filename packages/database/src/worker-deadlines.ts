import type { PrismaClient } from "./client.js";

/** Returns only a relative delay, never privileged rows or household details. */
export async function workerNextDelay(
  database: PrismaClient,
  types: readonly string[],
  includeDeletion: boolean,
): Promise<number | null> {
  const [row] = await database.$queryRaw<{ delay: number | null }[]>`
    SELECT app.worker_next_delay(${[...types]}::text[], ${includeDeletion}) AS delay
  `;
  if (
    !row ||
    (row.delay !== null && (!Number.isFinite(row.delay) || row.delay < 0))
  )
    throw new Error("Worker deadline unavailable");
  return row.delay;
}
