import { setTimeout as delay } from "node:timers/promises";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createDatabaseNotifications } from "../packages/database/src/notifications.js";
import { createContributionFixture } from "./fixtures/contribution-budget.js";
import { contributionCapacity } from "./fixtures/contribution-plans.js";

let f: ReturnType<typeof createContributionFixture>;
beforeEach(async () => {
  f = createContributionFixture();
  await f.setup();
});
afterEach(() => f.close());
it("delivers empty hints only after committed changes and stays silent for reads, rollback and unchanged intent", async () => {
  const ready = vi.fn(),
    wake = vi.fn();
  const listener = createDatabaseNotifications({
    topic: "status",
    connectionString: process.env.DATABASE_URL ?? "",
    timeoutMs: 1000,
    retryMaxMs: 1000,
    onReady: ready,
    onWake: wake,
  });
  try {
    await vi.waitFor(() => expect(ready).toHaveBeenCalledOnce());
    await expect(f.readBudget()).rejects.toThrow();
    await delay(100);
    expect(wake).not.toHaveBeenCalled();
    await expect(
      f.scoped.withScope(f.a, async (tx) => {
        await tx.$queryRaw`SELECT app.write_contribution_capacity(0,${JSON.stringify(contributionCapacity)}::jsonb)`;
        throw new Error("Synthetic contribution rollback");
      }),
    ).rejects.toThrow("Synthetic contribution rollback");
    await delay(100);
    expect(wake).not.toHaveBeenCalled();
    await f.scoped.withScope(f.a, async (tx) => {
      await tx.$queryRaw`SELECT app.write_contribution_capacity(0,${JSON.stringify(contributionCapacity)}::jsonb)`;
      expect(wake).not.toHaveBeenCalled();
    });
    await vi.waitFor(() => expect(wake).toHaveBeenCalledOnce());
    expect(wake.mock.calls).toEqual([[]]);
    await f.readBudget();
    await f.writeCapacity(1);
    await delay(100);
    expect(wake).toHaveBeenCalledOnce();
    await f.writePlan(1);
    await vi.waitFor(() => expect(wake).toHaveBeenCalledTimes(2));
    await f.writePlan(2, f.planInput("30000", 1));
    await delay(100);
    expect(wake).toHaveBeenCalledTimes(2);
    await f.scoped.withScope(
      f.a,
      (tx) =>
        tx.$queryRaw`SELECT app.write_goal(${f.goalId}::uuid,1,${JSON.stringify({ ...f.goalInput, priority: 3 })}::jsonb)`,
    );
    await vi.waitFor(() => expect(wake).toHaveBeenCalledTimes(3));
    expect(wake.mock.calls).toEqual([[], [], []]);
    expect((await f.readBudget()).view.budget.version).toBe(3);
  } finally {
    await listener.close();
  }
});
it("reconciles missed committed changes from bounded durable history", async () => {
  await f.writeCapacity();
  for (let version = 1; version <= 52; version += 1) {
    await f.writeCapacity(version, {
      ...contributionCapacity,
      monthlyContributions: [
        {
          fromMonth: 1,
          amount: { amountMinor: String(version), currency: "GBP" },
        },
      ],
    });
  }
  const first = await f.readBudget();
  expect(first.history).toHaveLength(50);
  expect(first.nextAfterVersion).toBe(50);
  const next = await f.readBudget(f.a, null, first.nextAfterVersion ?? 0);
  expect(next.history.map((entry) => entry.version)).toEqual([51, 52, 53]);
  expect(next.nextAfterVersion).toBeNull();
  expect(
    next.view.budget.capacity.monthlyContributions[0]?.amount.amountMinor,
  ).toBe("52");
});
