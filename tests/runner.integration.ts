import { randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import { createOrm } from "../packages/database/dist/client.js";
import { JobsRepository } from "../packages/database/dist/jobs.repository.js";
import { runJobs } from "../apps/worker/dist/job-runner.js";

it("runs a bounded synthetic import batch and commits its domain write and outbox together", async () => {
  const database = createOrm(
    process.env.DATABASE_URL ??
      "postgresql://joint:local-development-only@127.0.0.1:5432/joint",
  );
  const householdId = randomUUID();
  const type = `synthetic.import.${randomUUID()}`;
  const jobs = new JobsRepository(database);
  try {
    await database.household.create({ data: { id: householdId } });
    for (let index = 0; index < 3; index++)
      await jobs.enqueue({
        householdId,
        type,
        resourceId: randomUUID(),
        idempotencyKey: String(index),
        payload: {},
      });
    const handlers = {
      [type]: async (
        lease: import("../packages/database/dist/jobs.repository.js").JobLease,
        tx: import("../packages/database/dist/client.js").Prisma.TransactionClient,
      ) => {
        await tx.household.update({
          where: { id: lease.householdId },
          data: { revision: { increment: 1 } },
        });
        await tx.outboxEvent.create({
          data: {
            householdId: lease.householdId,
            jobId: lease.id,
            type: "synthetic.imported",
            payload: {},
          },
        });
      },
    };
    expect(
      await runJobs(jobs, handlers, {
        owner: "test",
        maxJobs: 2,
        budgetMs: 2000,
      }),
    ).toEqual({ succeeded: 2, failed: 0 });
    expect(
      (
        await database.household.findUniqueOrThrow({
          where: { id: householdId },
        })
      ).revision,
    ).toBe(2);
    expect(await database.outboxEvent.count({ where: { householdId } })).toBe(
      2,
    );
    expect(
      await database.job.count({ where: { householdId, state: "QUEUED" } }),
    ).toBe(1);
    expect(
      await runJobs(jobs, handlers, {
        owner: "test",
        maxJobs: 2,
        budgetMs: 2000,
        signal: AbortSignal.abort(),
      }),
    ).toEqual({ succeeded: 0, failed: 0 });
    expect(
      await runJobs(jobs, {}, { owner: "test", maxJobs: 2, budgetMs: 2000 }),
    ).toEqual({ succeeded: 0, failed: 0 });
  } finally {
    await database.household.deleteMany({ where: { id: householdId } });
    await database.$disconnect();
  }
});

it("retries a failed handler without publishing its writes or exception details", async () => {
  const database = createOrm(
    process.env.DATABASE_URL ??
      "postgresql://joint:local-development-only@127.0.0.1:5432/joint",
  );
  const householdId = randomUUID();
  const type = `synthetic.failure.${randomUUID()}`;
  const jobs = new JobsRepository(database);
  try {
    await database.household.create({ data: { id: householdId } });
    const job = await jobs.enqueue({
      householdId,
      type,
      resourceId: randomUUID(),
      idempotencyKey: randomUUID(),
      payload: {},
    });
    expect(
      await runJobs(
        jobs,
        {
          [type]: async () => {
            throw new Error("synthetic-secret-never-store");
          },
        },
        { owner: "test", maxJobs: 2, budgetMs: 1000 },
      ),
    ).toEqual({ succeeded: 0, failed: 1 });
    const stored = await database.job.findUniqueOrThrow({
      where: { id: job.id },
    });
    expect(stored.state).toBe("RETRY_WAIT");
    expect(stored.runAfter.getTime()).toBeGreaterThan(Date.now());
    expect(JSON.stringify(stored)).not.toContain(
      "synthetic-secret-never-store",
    );
  } finally {
    await database.household.deleteMany({ where: { id: householdId } });
    await database.$disconnect();
  }
});

it("bounds an unresponsive handler so the worker can finish its cycle", async () => {
  const database = createOrm(
    process.env.DATABASE_URL ??
      "postgresql://joint:local-development-only@127.0.0.1:5432/joint",
  );
  const householdId = randomUUID();
  const type = `synthetic.timeout.${randomUUID()}`;
  const jobs = new JobsRepository(database);
  try {
    await database.household.create({ data: { id: householdId } });
    await jobs.enqueue({
      householdId,
      type,
      resourceId: randomUUID(),
      idempotencyKey: randomUUID(),
      payload: {},
    });
    const started = performance.now();
    const result = await runJobs(
      jobs,
      {
        [type]: async () => {
          await new Promise(() => {});
        },
      },
      { owner: "test", maxJobs: 1, budgetMs: 250 },
    );
    expect(performance.now() - started).toBeLessThan(1000);
    expect(result.failed).toBe(1);
    expect(
      (
        await database.household.findUniqueOrThrow({
          where: { id: householdId },
        })
      ).revision,
    ).toBe(0);
  } finally {
    await database.household.deleteMany({ where: { id: householdId } });
    await database.$disconnect();
  }
}, 2000);
