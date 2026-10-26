import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createDatabaseNotifications } from "../packages/database/src/notifications.js";
import { createGoalAllocationFixture } from "./fixtures/goal-allocation.js";

let f: ReturnType<typeof createGoalAllocationFixture>;
beforeEach(async () => {
  f = createGoalAllocationFixture();
  await f.setup();
});
afterEach(async () => {
  await f.close();
});

it("emits empty committed hints and stays silent for reads, rollback and unchanged intentions", async () => {
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
  const body = JSON.stringify(f.input());
  try {
    await vi.waitFor(() => expect(ready).toHaveBeenCalledOnce());
    await f.readAllocation();
    await delay(100);
    expect(wake).not.toHaveBeenCalled();
    await expect(
      f.scoped.withScope(f.a, async (tx) => {
        await tx.$queryRaw`SELECT app.write_goal_allocations(${f.goalId}::uuid,1,${body}::jsonb)`;
        throw Error("Synthetic rollback");
      }),
    ).rejects.toThrow("Synthetic rollback");
    await delay(100);
    expect(wake).not.toHaveBeenCalled();
    await f.scoped.withScope(f.a, async (tx) => {
      await tx.$queryRaw`SELECT app.write_goal_allocations(${f.goalId}::uuid,1,${body}::jsonb)`;
      expect(wake).not.toHaveBeenCalled();
    });
    await vi.waitFor(() => expect(wake).toHaveBeenCalledOnce());
    expect(wake.mock.calls).toEqual([[]]);
    await f.writeAllocation(f.input(1));
    await f.readAllocation();
    await delay(100);
    expect(wake).toHaveBeenCalledOnce();
  } finally {
    await subscription.close();
  }
});

it.each(["session", "ownership", "valuation"])(
  "rechecks %s after waiting for an account lock",
  async (change) => {
    let queued: Promise<unknown> | undefined;
    await f.owner.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM app."Account" WHERE id=${f.account}::uuid FOR UPDATE`;
      queued = f.writeAllocation().then(
        (value) => ({ value }),
        (error: unknown) => ({ error }),
      );
      // Bounded test-only observation proves the writer is actually waiting;
      // application updates never use this catalogue query loop.
      await vi.waitFor(async () => {
        await tx.$executeRaw`SELECT pg_stat_clear_snapshot()`;
        const [row] = await tx.$queryRaw<
          { waiting: boolean }[]
        >`SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND query LIKE '%app.write_goal_allocations%' AND wait_event_type='Lock') AS waiting`;
        expect(row?.waiting).toBe(true);
      });
      if (change === "session")
        await tx.sessionRegistry.update({
          where: { id: f.a.sessionId },
          data: { expiresAt: new Date(Date.now() - 1000) },
        });
      else if (change === "ownership")
        await tx.accountOwner.update({
          where: {
            accountId_userId: { accountId: f.account, userId: f.a.userId },
          },
          data: { status: "ARCHIVED" },
        });
      else
        await tx.balanceSnapshot.create({
          data: {
            id: randomUUID(),
            householdId: f.hh,
            accountId: f.account,
            authorMembershipId: f.a.membershipId,
            amountMinor: 50000n,
            adultAmountMinor: 50000n,
            asOfDate: new Date(new Date().toISOString().slice(0, 10)),
            createdAt: new Date(Date.now() + 1000),
          },
        });
    });
    expect(await queued).toMatchObject({ error: expect.any(Error) });
    expect(
      await f.owner.goalAllocation.count({ where: { householdId: f.hh } }),
    ).toBe(0);
  },
);

it("reconciles from committed history and bounds continuation to the selected source", async () => {
  for (let version = 0; version < 52; version++)
    await f.writeAllocation(
      f.input(version, [f.fixed(f.account, String(version + 1))]),
    );
  const first = await f.readAllocation();
  expect(first.history).toHaveLength(50);
  expect(first.nextAfter).toEqual({ accountId: f.account, version: 50 });
  const next = await f.readAllocation(
    f.a,
    [f.account],
    f.goalId,
    first.nextAfter,
  );
  expect(next.history.map((r) => r.version)).toEqual([51, 52]);
  expect(next.nextAfter).toBeNull();
  expect(next.view.scope.sources).toEqual([
    { accountId: f.account, version: 52 },
  ]);
  await expect(
    f.readAllocation(f.a, [f.emptyAccount], f.goalId, first.nextAfter),
  ).rejects.toThrow(/22023/);
});

it("notifies committed funding and goal metadata changes that alter allocation views", async () => {
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
    await vi.waitFor(() => expect(ready).toHaveBeenCalledOnce());
    await f.write(f.a, 1, {
      ...f.data,
      settledAdultMoney: { amountMinor: "50000", currency: "GBP" },
      billReserves: { amountMinor: "10000", currency: "GBP" },
    });
    await vi.waitFor(() => expect(wake).toHaveBeenCalledOnce());
    expect(
      (await f.readAllocation()).view.positions[0]?.available?.amountMinor,
    ).toBe("40000");
    await f.scoped.withScope(
      f.a,
      (tx) =>
        tx.$queryRaw`SELECT app.write_goal(${f.goalId}::uuid,1,${JSON.stringify({ ...f.goalInput, name: "Changed shared goal" })}::jsonb)`,
    );
    await vi.waitFor(() => expect(wake).toHaveBeenCalledTimes(2));
    expect((await f.readAllocation()).view.version).toBe(2);
    expect(wake.mock.calls).toEqual([[], []]);
  } finally {
    await subscription.close();
  }
});
