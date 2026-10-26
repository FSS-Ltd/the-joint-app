import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, expect, it } from "vitest";
import { createGoalAllocationFixture } from "./fixtures/goal-allocation.js";

let f: ReturnType<typeof createGoalAllocationFixture>;
beforeEach(async () => {
  f = createGoalAllocationFixture();
  await f.setup();
});
afterEach(async () => {
  await f.close();
});

it("denies a viewing member before waiting on a private owner's account lock", async () => {
  await f.owner.$transaction(async (blocker) => {
    await blocker.$queryRaw`SELECT id FROM app."Account" WHERE id=${f.account}::uuid FOR UPDATE`;
    await expect(
      f.scoped.withScope(f.b, async (tx) => {
        await tx.$executeRaw`SET LOCAL lock_timeout='100ms'`;
        return tx.$queryRaw`SELECT app.read_goal_allocations(${f.goalId}::uuid,ARRAY[${f.account}::uuid],NULL)`;
      }),
    ).rejects.toThrow(/P0002/);
  });
});

it("denies an archived owner's foreign source before acquiring a cross-household lock", async () => {
  const foreign = createGoalAllocationFixture();
  try {
    await foreign.setup();
    await f.scoped.withScope(
      f.a,
      (tx) => tx.$queryRaw`SELECT app.leave_household()`,
    );
    f.a.sessionId = randomUUID();
    await f.owner.sessionRegistry.create({
      data: {
        id: f.a.sessionId,
        userId: f.a.userId,
        expiresAt: new Date(Date.now() + 600000),
      },
    });
    await foreign.owner.$transaction(async (blocker) => {
      await blocker.$queryRaw`SELECT id FROM app."Account" WHERE id=${foreign.account}::uuid FOR UPDATE`;
      await expect(
        f.archive.withScope(f.a, async (tx) => {
          await tx.$executeRaw`SET LOCAL lock_timeout='100ms'`;
          return tx.$queryRaw`SELECT app.read_goal_allocations(${f.goalId}::uuid,ARRAY[${foreign.account}::uuid],NULL)`;
        }),
      ).rejects.toThrow(/P0002/);
    });
  } finally {
    await foreign.close();
  }
});
