import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { createOrm } from "../packages/database/dist/client.js";
import { createDatabaseNotifications } from "../packages/database/src/notifications.js";
import { JobsRepository } from "../packages/database/dist/jobs.repository.js";
import { createFixtureOwner } from "./fixtures/database.js";

if (!process.env.DATABASE_URL)
  throw new Error("Status tests need runtime configuration");
const runtime = createOrm(process.env.DATABASE_URL),
  owner = createFixtureOwner();
const householdId = randomUUID(),
  userId = randomUUID(),
  membershipId = randomUUID(),
  sessionId = randomUUID();
const accountId = randomUUID(),
  receiptId = randomUUID();
beforeAll(async () => {
  await owner.household.create({ data: { id: householdId } });
  await owner.user.create({
    data: {
      id: userId,
      memberships: { create: { id: membershipId, householdId, slot: 1 } },
      sessions: {
        create: {
          id: sessionId,
          householdId,
          kind: "WEB",
          browserTokenHash: randomUUID().replaceAll("-", "").repeat(2),
          providerTokens: "synthetic-envelope",
          providerExpiresAt: new Date(Date.now() + 30000),
          expiresAt: new Date(Date.now() + 60000),
        },
      },
    },
  });
  await owner.account.create({
    data: {
      id: accountId,
      householdId,
      creatorUserId: userId,
      creatorMembershipId: membershipId,
      kind: "CURRENT",
      label: "Synthetic status",
    },
  });
  await owner.deletionRequest.create({
    data: {
      id: receiptId,
      userId,
      statusTokenHash: "c".repeat(64),
      statusExpiresAt: new Date(Date.now() + 60000),
    },
  });
});
afterAll(async () => {
  await owner.job.deleteMany({ where: { householdId } });
  await owner.deletionRequest.deleteMany({ where: { userId } });
  await owner.account.deleteMany({ where: { householdId } });
  await owner.household.delete({ where: { id: householdId } });
  await owner.user.delete({ where: { id: userId } });
  await runtime.$disconnect();
  await owner.$disconnect();
});

it("ignores auth bookkeeping, coalesces meaningful committed changes and discards rollback notifications", async () => {
  const ready = vi.fn(),
    wake = vi.fn();
  const subscription = createDatabaseNotifications({
    topic: "status",
    connectionString: process.env.DATABASE_URL ?? "",
    timeoutMs: 1000,
    retryMaxMs: 1000,
    onReady: ready,
    onWake: wake,
  });
  try {
    await vi.waitFor(() => expect(ready).toHaveBeenCalledTimes(1));
    await owner.sessionRegistry.update({
      where: { id: sessionId },
      data: {
        lastSeenAt: new Date(),
        providerExpiresAt: new Date(Date.now() + 30000),
        providerTokens: "synthetic-refresh",
      },
    });
    await delay(100);
    expect(wake).not.toHaveBeenCalled();
    await expect(
      owner.$transaction(async (tx) => {
        await tx.account.update({
          where: { id: accountId },
          data: { label: "Rolled back" },
        });
        throw new Error("rollback");
      }),
    ).rejects.toThrow("rollback");
    await delay(100);
    expect(wake).not.toHaveBeenCalled();
    await owner.$transaction(async (tx) => {
      await tx.sessionRegistry.update({
        where: { id: sessionId },
        data: { revokedAt: new Date() },
      });
      await tx.membership.update({
        where: { id: membershipId },
        data: { grantVersion: { increment: 1 } },
      });
      await tx.account.update({
        where: { id: accountId },
        data: { label: "Committed" },
      });
      expect(wake).not.toHaveBeenCalled();
    });
    await vi.waitFor(() => expect(wake).toHaveBeenCalledTimes(1));
    expect(wake.mock.calls).toEqual([[]]);
    await owner.sessionRegistry.update({
      where: { id: sessionId },
      data: { expiresAt: new Date(Date.now() + 5000) },
    });
    await vi.waitFor(() => expect(wake).toHaveBeenCalledTimes(2));
  } finally {
    await subscription.close();
  }
});

it("returns a receipt deadline only for the matching unexpired opaque receipt hash", async () => {
  const deadline = async (id: string, hash: string) => {
    const [row] = await runtime.$queryRaw<
      { expiresAt: Date | null }[]
    >`SELECT app.deletion_receipt_deadline(${id}::uuid,${hash}) AS "expiresAt"`;
    return row?.expiresAt ?? null;
  };
  expect(await deadline(receiptId, "c".repeat(64))).toBeInstanceOf(Date);
  expect(await deadline(randomUUID(), "c".repeat(64))).toBeNull();
  expect(await deadline(receiptId, "d".repeat(64))).toBeNull();
  await owner.deletionRequest.update({
    where: { id: receiptId },
    data: { statusExpiresAt: new Date(Date.now() - 1) },
  });
  expect(await deadline(receiptId, "c".repeat(64))).toBeNull();
  await expect(
    runtime.$queryRaw`SELECT "statusExpiresAt" FROM app."DeletionRequest" WHERE id=${receiptId}::uuid`,
  ).rejects.toThrow();
});

it("notifies terminal export job failures, cancellations and exhaustion without heartbeat wakeups", async () => {
  const jobs = new JobsRepository(owner);
  const ids: string[] = [];
  for (const mode of ["failure", "cancellation", "exhaustion"]) {
    const job = await jobs.enqueue({
      householdId,
      type: "csv.export",
      resourceId: randomUUID(),
      idempotencyKey: `${mode}:${randomUUID()}`,
      payload: {},
      maxAttempts: 1,
    });
    ids.push(job.id);
  }
  const ready = vi.fn(),
    wake = vi.fn();
  const subscription = createDatabaseNotifications({
    topic: "status",
    connectionString: process.env.DATABASE_URL ?? "",
    timeoutMs: 1000,
    retryMaxMs: 1000,
    onReady: ready,
    onWake: wake,
  });
  try {
    await vi.waitFor(() => expect(ready).toHaveBeenCalledTimes(1));
    const failed = await jobs.claim(
      "status-test",
      ["csv.export"],
      5000,
      ids[0],
    );
    if (!failed) throw new Error("Fixture lease unavailable");
    expect(await jobs.heartbeat(failed, 5000)).toBe(true);
    await delay(100);
    expect(wake).not.toHaveBeenCalled();
    expect(await jobs.fail(failed, 0)).toBe(true);
    await vi.waitFor(() => expect(wake).toHaveBeenCalledTimes(1));
    if (!ids[1]) throw new Error("Fixture job unavailable");
    expect(await jobs.cancel(householdId, ids[1])).toBe(true);
    await vi.waitFor(() => expect(wake).toHaveBeenCalledTimes(2));
    const exhausted = await jobs.claim(
      "status-test",
      ["csv.export"],
      10,
      ids[2],
    );
    if (!exhausted) throw new Error("Fixture lease unavailable");
    await delay(30);
    expect(
      await jobs.claim("status-test", ["csv.export"], 10, exhausted.id),
    ).toBeNull();
    await vi.waitFor(() => expect(wake).toHaveBeenCalledTimes(3));
    expect(wake.mock.calls).toEqual([[], [], []]);
  } finally {
    await subscription.close();
  }
});
