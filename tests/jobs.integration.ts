import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { afterAll, beforeAll, expect, it } from "vitest";
import { createOrm } from "../packages/database/dist/client.js";
import { JobsRepository } from "../packages/database/dist/jobs.repository.js";

const database = createOrm(
  process.env.DATABASE_URL ??
    "postgresql://joint:local-development-only@127.0.0.1:5432/joint",
);
const jobs = new JobsRepository(database);
const householdId = randomUUID();
const secondHouseholdId = randomUUID();
beforeAll(async () => {
  await database.household.createMany({
    data: [{ id: householdId }, { id: secondHouseholdId }],
  });
});
afterAll(async () => {
  await database.household.deleteMany({
    where: { id: { in: [householdId, secondHouseholdId] } },
  });
  await database.$disconnect();
});
const enqueue = (key = randomUUID(), household = householdId) =>
  jobs.enqueue({
    householdId: household,
    type: "synthetic.import",
    resourceId: randomUUID(),
    idempotencyKey: key,
    payload: { rows: 2 },
    maxAttempts: 2,
  });

it("keeps enqueue idempotent within a household and distinct across households", async () => {
  const key = randomUUID();
  const first = await enqueue(key);
  const duplicate = await enqueue(key);
  const other = await enqueue(key, secondHouseholdId);
  expect(duplicate.id).toBe(first.id);
  expect(other.id).not.toBe(first.id);
});

it("claims work exclusively and fences a worker after crash/lease expiry", async () => {
  const job = await enqueue();
  const claims = await Promise.all([
    jobs.claim("worker-a", ["synthetic.import"], 100, job.id),
    jobs.claim("worker-b", ["synthetic.import"], 100, job.id),
  ]);
  const lease = claims.find((value) => value !== null);
  expect(lease).toBeTruthy();
  expect(claims.filter(Boolean)).toHaveLength(1);
  if (!lease) throw new Error("Expected a lease");
  await delay(150);
  const recovered = await jobs.claim(
    "worker-c",
    ["synthetic.import"],
    2000,
    job.id,
  );
  expect(recovered?.attempt).toBe(2);
  expect(await jobs.heartbeat(lease, 2000)).toBe(false);
  expect(await jobs.complete(lease, async () => {})).toBe(false);
  if (!recovered) throw new Error("Expected a recovered lease");
  expect(
    await jobs.complete(recovered, async (tx) => {
      await tx.outboxEvent.create({
        data: {
          householdId,
          jobId: job.id,
          type: "synthetic.imported",
          payload: { rows: 2 },
        },
      });
    }),
  ).toBe(true);
  expect(
    await jobs.complete(recovered, async () => {
      throw new Error("duplicate execution");
    }),
  ).toBe(false);
  expect(await database.outboxEvent.count({ where: { jobId: job.id } })).toBe(
    1,
  );
});

it("rolls back domain writes and outbox when a handler fails", async () => {
  const job = await enqueue();
  const lease = await jobs.claim("worker", [job.type], 2000, job.id);
  if (!lease) throw new Error("Expected a lease");
  await expect(
    jobs.complete(lease, async (tx) => {
      await tx.household.update({
        where: { id: householdId },
        data: { revision: { increment: 1 } },
      });
      await tx.outboxEvent.create({
        data: {
          householdId,
          jobId: job.id,
          type: "synthetic.imported",
          payload: {},
        },
      });
      throw new Error("synthetic failure");
    }),
  ).rejects.toThrow("synthetic failure");
  expect(
    (await database.household.findUniqueOrThrow({ where: { id: householdId } }))
      .revision,
  ).toBe(0);
  expect(await database.outboxEvent.count({ where: { jobId: job.id } })).toBe(
    0,
  );
  expect(await jobs.fail(lease, 10)).toBe(true);
  expect(
    (await database.job.findUniqueOrThrow({ where: { id: job.id } })).state,
  ).toBe("RETRY_WAIT");
  expect(await jobs.claim("worker", [job.type], 2000, job.id)).toBeNull();
});

it("rolls back work if the lease expires during its transaction", async () => {
  const job = await enqueue();
  const lease = await jobs.claim("slow", [job.type], 80, job.id);
  if (!lease) throw new Error("Expected a lease");
  expect(
    await jobs.complete(lease, async (tx) => {
      await tx.household.update({
        where: { id: householdId },
        data: { revision: { increment: 1 } },
      });
      await delay(120);
    }),
  ).toBe(false);
  expect(
    (await database.household.findUniqueOrThrow({ where: { id: householdId } }))
      .revision,
  ).toBe(0);
});

it("extends a live lease and rejects cancellation across households", async () => {
  const job = await enqueue();
  const lease = await jobs.claim("worker", [job.type], 100, job.id);
  if (!lease) throw new Error("Expected a lease");
  expect(await jobs.heartbeat(lease, 2000)).toBe(true);
  await delay(150);
  expect(await jobs.claim("other", [job.type], 2000, job.id)).toBeNull();
  expect(await jobs.cancel(secondHouseholdId, job.id)).toBe(false);
  expect(await jobs.cancel(householdId, job.id)).toBe(true);
  expect(
    await jobs.complete(lease, async () => {
      throw new Error("cancelled work");
    }),
  ).toBe(false);
  expect(
    (await database.job.findUniqueOrThrow({ where: { id: job.id } })).state,
  ).toBe("CANCELLED");
});

it("terminates repeated failures without logging exception payloads", async () => {
  const job = await enqueue();
  for (let attempt = 1; attempt <= 2; attempt++) {
    const lease = await jobs.claim("worker", [job.type], 2000, job.id);
    if (!lease) throw new Error("Expected a lease");
    expect(await jobs.fail(lease, 0)).toBe(true);
  }
  expect(await jobs.claim("worker", [job.type], 2000, job.id)).toBeNull();
  const stored = await database.job.findUniqueOrThrow({
    where: { id: job.id },
  });
  expect(stored.state).toBe("FAILED");
  expect(stored.leaseToken).toBeNull();
});

it("marks an exhausted crashed lease failed without another delivery", async () => {
  const job = await jobs.enqueue({
    householdId,
    type: "synthetic.import",
    resourceId: randomUUID(),
    idempotencyKey: randomUUID(),
    payload: {},
    maxAttempts: 1,
  });
  expect(await jobs.claim("crashed", [job.type], 50, job.id)).not.toBeNull();
  await delay(100);
  expect(await jobs.claim("replacement", [job.type], 2000, job.id)).toBeNull();
  expect(
    (await database.job.findUniqueOrThrow({ where: { id: job.id } })).state,
  ).toBe("FAILED");
});

it("rejects cross-household outbox references at the database boundary", async () => {
  const job = await enqueue();
  await expect(
    database.outboxEvent.create({
      data: {
        householdId: secondHouseholdId,
        jobId: job.id,
        type: "synthetic.imported",
        payload: {},
      },
    }),
  ).rejects.toThrow();
  expect(await database.outboxEvent.count({ where: { jobId: job.id } })).toBe(
    0,
  );
});
