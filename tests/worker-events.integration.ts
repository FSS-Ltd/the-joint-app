import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { createOrm } from "../packages/database/dist/client.js";
import { JobsRepository } from "../packages/database/dist/jobs.repository.js";
import { createWorkerNotifications } from "../packages/database/src/worker-notifications.js";
import { workerNextDelay } from "../packages/database/src/worker-deadlines.js";
import { createWorkerScheduler } from "../apps/worker/src/scheduler.js";
import { runJobs } from "../apps/worker/src/job-runner.js";
import { maintainImports } from "../apps/worker/src/import-maintenance.js";
import { maintainExports } from "../packages/database/src/export-maintenance.js";
import { createFixtureOwner } from "./fixtures/database.js";

const owner = createFixtureOwner();
const connectionString = process.env.DATABASE_URL;
if (!connectionString)
  throw new Error("Worker events need runtime configuration");
const runtime = createOrm(connectionString);
const householdId = randomUUID();
const userId = randomUUID();
const membershipId = randomUUID();
const accountId = randomUUID();
const sessionId = randomUUID();
const type = `synthetic.events.${randomUUID()}`;
const jobs = new JobsRepository(runtime);
beforeAll(async () => {
  await owner.household.create({ data: { id: householdId } });
  await owner.user.create({
    data: {
      id: userId,
      memberships: { create: { id: membershipId, householdId, slot: 1 } },
    },
  });
  await owner.account.create({
    data: {
      id: accountId,
      householdId,
      creatorUserId: userId,
      creatorMembershipId: membershipId,
      kind: "CURRENT",
      label: "Synthetic events",
    },
  });
  await owner.sessionRegistry.create({
    data: {
      id: sessionId,
      userId,
      householdId,
      expiresAt: new Date(Date.now() + 60000),
    },
  });
});
afterAll(async () => {
  await owner.exportChunk.deleteMany({
    where: {
      exportId: {
        in: (
          await owner.exportRequest.findMany({
            where: { householdId },
            select: { id: true },
          })
        ).map((row) => row.id),
      },
    },
  });
  await owner.exportRequest.deleteMany({ where: { householdId } });
  await owner.deletionRequest.deleteMany({ where: { userId } });
  await owner.importBatch.deleteMany({ where: { householdId } });
  await owner.account.deleteMany({ where: { householdId } });
  await owner.household.delete({ where: { id: householdId } });
  await owner.user.delete({ where: { id: userId } });
  await runtime.$disconnect();
  await owner.$disconnect();
});
const job = () => ({
  householdId,
  type,
  resourceId: randomUUID(),
  idempotencyKey: randomUUID(),
  payload: {},
});

it("delivers only committed empty notifications, coalesces a transaction and cleans up LISTEN", async () => {
  const ready = vi.fn();
  const wake = vi.fn();
  const subscription = createWorkerNotifications({
    connectionString,
    timeoutMs: 1000,
    retryMaxMs: 1000,
    onReady: ready,
    onWake: wake,
  });
  try {
    await vi.waitFor(() => expect(ready).toHaveBeenCalledTimes(1));
    await expect(
      owner.$transaction(async (tx) => {
        await tx.job.create({ data: job() });
        throw new Error("rollback");
      }),
    ).rejects.toThrow("rollback");
    await delay(100);
    expect(wake).not.toHaveBeenCalled();
    await owner.$transaction(async (tx) => {
      await tx.job.create({ data: job() });
      await tx.job.create({ data: job() });
      expect(wake).not.toHaveBeenCalled();
    });
    await vi.waitFor(() => expect(wake).toHaveBeenCalledTimes(1));
    expect(wake.mock.calls).toEqual([[]]);
    // Notifications with untrusted content are not interpreted or exposed.
    await owner.$executeRaw`SELECT pg_notify('joint_worker_wakeup', 'synthetic-untrusted')`;
    await delay(100);
    expect(wake).toHaveBeenCalledTimes(1);
  } finally {
    await subscription.close();
  }
  await jobs.enqueue(job());
  await delay(50);
  expect(wake).toHaveBeenCalledTimes(1);
  const sessions = await owner.$queryRaw<
    { count: bigint }[]
  >`SELECT count(*) FROM pg_stat_activity WHERE application_name = 'joint-worker-events'`;
  expect(sessions[0]?.count).toBe(0n);
  await owner.job.deleteMany({ where: { householdId } });
});

it("reconciles startup and missed events after reconnect, with no idle database reads", async () => {
  const existing = await jobs.enqueue(job());
  const cycle = vi.fn(async () => {
    await runJobs(
      jobs,
      { [type]: async () => {} },
      { owner: "events-fixture", maxJobs: 10, budgetMs: 5000 },
    );
    return workerNextDelay(runtime, [type], false);
  });
  const scheduler = createWorkerScheduler(cycle, { retryMaxMs: 1000 });
  const ready = vi.fn(() => scheduler.wake());
  const unavailable = vi.fn();
  const subscription = createWorkerNotifications({
    connectionString,
    timeoutMs: 1000,
    retryMaxMs: 1000,
    onReady: ready,
    onWake: scheduler.wake,
    onUnavailable: unavailable,
  });
  try {
    await vi.waitFor(async () =>
      expect(
        (await owner.job.findUniqueOrThrow({ where: { id: existing.id } }))
          .state,
      ).toBe("SUCCEEDED"),
    );
    await delay(100);
    const idleReads = cycle.mock.calls.length;
    await delay(1200);
    expect(cycle).toHaveBeenCalledTimes(idleReads);
    await owner.$queryRaw`SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE application_name = 'joint-worker-events' AND datname = current_database()`;
    await vi.waitFor(() => expect(unavailable).toHaveBeenCalled());
    const missed = await jobs.enqueue(job());
    await vi.waitFor(
      async () =>
        expect(
          (await owner.job.findUniqueOrThrow({ where: { id: missed.id } }))
            .state,
        ).toBe("SUCCEEDED"),
      { timeout: 4000 },
    );
    expect(ready.mock.calls.length).toBeGreaterThanOrEqual(2);
    // Duplicate hints cannot repeat a completed handler.
    await owner.$executeRaw`SELECT pg_notify('joint_worker_wakeup', '')`;
    await delay(100);
    expect(
      await owner.job.count({
        where: { householdId, state: "SUCCEEDED", attempt: 1 },
      }),
    ).toBe(2);
  } finally {
    await subscription.close();
    await scheduler.close();
  }
  await owner.job.deleteMany({ where: { householdId } });
});

it("uses durable retry/lease deadlines and ignores unregistered job types", async () => {
  expect(await workerNextDelay(runtime, [], false)).toBeNull();
  const queued = await jobs.enqueue(job());
  expect(await workerNextDelay(runtime, [type], false)).toBe(0);
  await owner.job.update({
    where: { id: queued.id },
    data: { state: "RETRY_WAIT", runAfter: new Date(Date.now() + 2000) },
  });
  const retry = await workerNextDelay(runtime, [type], false);
  expect(retry).toBeGreaterThan(0);
  expect(retry).toBeLessThanOrEqual(2000);
  expect(await workerNextDelay(runtime, [], false)).toBeNull();
  await owner.job.update({
    where: { id: queued.id },
    data: {
      state: "LEASED",
      leaseOwner: "crashed",
      leaseToken: randomUUID(),
      leaseUntil: new Date(Date.now() - 1),
      attempt: 5,
    },
  });
  expect(await workerNextDelay(runtime, [type], false)).toBe(0);
  expect(await jobs.claim("new-worker", [type], 1000)).toBeNull();
  expect(
    (await owner.job.findUniqueOrThrow({ where: { id: queued.id } })).state,
  ).toBe("FAILED");
  expect(await workerNextDelay(runtime, [type], false)).toBeNull();
  await owner.job.deleteMany({ where: { householdId } });
});

it("executes a scheduled retry and a crashed lease without another notification", async () => {
  const retryJob = await jobs.enqueue(job());
  const crashed = await owner.job.create({
    data: {
      ...job(),
      state: "LEASED",
      leaseOwner: "crashed",
      leaseToken: randomUUID(),
      leaseUntil: new Date(Date.now() + 1000),
      attempt: 1,
    },
  });
  let attempts = 0;
  const scheduler = createWorkerScheduler(
    async () => {
      await runJobs(
        jobs,
        {
          [type]: async (lease) => {
            if (lease.id === retryJob.id && attempts++ === 0)
              throw new Error("synthetic retry");
          },
        },
        { owner: "due-fixture", maxJobs: 10, budgetMs: 5000 },
      );
      return workerNextDelay(runtime, [type], false);
    },
    { retryMaxMs: 1000 },
  );
  try {
    scheduler.wake();
    await vi.waitFor(
      async () =>
        expect(
          await owner.job.count({
            where: {
              id: { in: [retryJob.id, crashed.id] },
              state: "SUCCEEDED",
              attempt: 2,
            },
          }),
        ).toBe(2),
      { timeout: 5000 },
    );
    expect(attempts).toBe(2);
  } finally {
    await scheduler.close();
  }
  await owner.job.deleteMany({ where: { householdId } });
});

it("drains more than one bounded expiry batch and defers preview expiry to its live lease", async () => {
  const past = new Date(Date.now() - 1000);
  const batches = Array.from({ length: 101 }, () => ({
    id: randomUUID(),
    householdId,
    accountId,
    requestedByUserId: userId,
    requestedByMembershipId: membershipId,
    fileChecksum: randomUUID().replaceAll("-", "").repeat(2),
    mappingHash: "a".repeat(64),
    mapping: {},
    parserVersion: "1",
    state: "READY" as const,
    previewExpiresAt: past,
  }));
  await owner.importBatch.createMany({ data: batches });
  await owner.importObject.createMany({
    data: batches.map((b) => ({
      batchId: b.id,
      householdId,
      accountId,
      ciphertext: "synthetic",
      expiresAt: past,
    })),
  });
  expect(await workerNextDelay(runtime, [], false)).toBe(0);
  await maintainImports(runtime);
  expect(await workerNextDelay(runtime, [], false)).toBe(0);
  await maintainImports(runtime);
  expect(await workerNextDelay(runtime, [], false)).toBeNull();
  const batch = batches[0];
  if (!batch) throw new Error("Missing synthetic batch");
  await owner.importBatch.update({
    where: { id: batch.id },
    data: { state: "PREVIEWING" },
  });
  const lease = await owner.job.create({
    data: {
      ...job(),
      resourceId: batch.id,
      state: "LEASED",
      leaseOwner: "active",
      leaseToken: randomUUID(),
      leaseUntil: new Date(Date.now() + 2000),
    },
  });
  const remaining = await workerNextDelay(runtime, [], false);
  expect(remaining).toBeGreaterThan(0);
  expect(remaining).toBeLessThanOrEqual(2000);
  await owner.job.update({
    where: { id: lease.id },
    data: { state: "FAILED", leaseUntil: null },
  });
  expect(await workerNextDelay(runtime, [], false)).toBe(0);
  await maintainImports(runtime);
  expect(await workerNextDelay(runtime, [], false)).toBeNull();
  await owner.job.deleteMany({ where: { householdId } });
});

it("schedules failed-import reconciliation, export chunk cleanup and configured deletion only", async () => {
  const batch = await owner.importBatch.findFirstOrThrow({
    where: { householdId },
  });
  await owner.importBatch.update({
    where: { id: batch.id },
    data: {
      state: "COMMITTING",
      previewExpiresAt: new Date(Date.now() + 60000),
    },
  });
  await owner.job.create({
    data: {
      ...job(),
      type: "csv.commit",
      resourceId: batch.id,
      state: "FAILED",
    },
  });
  expect(await workerNextDelay(runtime, [], false)).toBe(0);
  await maintainImports(runtime);
  expect(
    (await owner.importBatch.findUniqueOrThrow({ where: { id: batch.id } }))
      .state,
  ).toBe("FAILED");
  const exportId = randomUUID();
  await owner.exportRequest.create({
    data: {
      id: exportId,
      householdId,
      userId,
      sessionId,
      membershipId,
      archive: false,
      expiresAt: new Date(Date.now() - 1),
      state: "EXPIRED",
    },
  });
  await owner.exportChunk.create({
    data: { exportId, sequence: 0, ciphertext: "synthetic" },
  });
  expect(await workerNextDelay(runtime, [], false)).toBe(0);
  await maintainExports(runtime);
  expect(await workerNextDelay(runtime, [], false)).toBeNull();
  await owner.deletionRequest.create({
    data: {
      id: randomUUID(),
      userId,
      statusTokenHash: "b".repeat(64),
      statusExpiresAt: new Date(Date.now() + 60000),
      runAfter: new Date(Date.now() + 3000),
      leaseToken: randomUUID(),
      leaseUntil: new Date(Date.now() + 1000),
    },
  });
  expect(await workerNextDelay(runtime, [], false)).toBeNull();
  const deletion = await workerNextDelay(runtime, [], true);
  expect(deletion).toBeGreaterThan(1000);
  expect(deletion).toBeLessThanOrEqual(3000);
});
