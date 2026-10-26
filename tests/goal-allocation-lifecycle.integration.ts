import { randomBytes, randomUUID } from "node:crypto";
import { afterEach, beforeEach, expect, it } from "vitest";
import { goalAllocationRawPageSchema } from "../packages/contracts/dist/index.js";
import { DeletionRepository } from "../packages/database/dist/deletion.repository.js";
import { createGoalAllocationFixture } from "./fixtures/goal-allocation.js";

let f: ReturnType<typeof createGoalAllocationFixture>;
beforeEach(async () => {
  f = createGoalAllocationFixture();
  await f.setup();
});
afterEach(async () => {
  await f.close();
});
async function archivePage(ids = [f.emptyAccount]) {
  return f.archive.withScope(f.a, async (tx) => {
    const [row] = await tx.$queryRaw<
      { data: unknown }[]
    >`SELECT app.read_goal_allocations(${f.goalId}::uuid,${ids}::uuid[],NULL) AS data`;
    return goalAllocationRawPageSchema.parse(row?.data);
  });
}
async function leave() {
  await f.scoped.withScope(
    f.a,
    (tx) => tx.$queryRaw`SELECT app.leave_household()`,
  );
  for (const c of [f.a, f.b]) {
    c.sessionId = randomUUID();
    await f.owner.sessionRegistry.create({
      data: {
        id: c.sessionId,
        userId: c.userId,
        householdId: c === f.a ? null : f.hh,
        expiresAt: new Date(Date.now() + 600000),
      },
    });
  }
  f.b.grantVersion = (
    await f.owner.membership.findUniqueOrThrow({
      where: { id: f.b.membershipId },
    })
  ).grantVersion;
}
function jointInput(version: number, amountMinor = "30000") {
  return {
    accountIds: [f.emptyAccount],
    sourceVersions: [{ accountId: f.emptyAccount, version }],
    allocations: [f.fixed(f.emptyAccount, amountMinor, f.emptyValuation)],
  };
}

it("archives a goal by atomically releasing verified intentions", async () => {
  await f.writeAllocation();
  await f.scoped.withScope(
    f.a,
    (tx) =>
      tx.$queryRaw`SELECT app.write_goal(${f.goalId}::uuid,1,${JSON.stringify({ ...f.goalInput, status: "ARCHIVED" })}::jsonb)`,
  );
  const page = await f.readAllocation();
  expect(page.view.version).toBe(2);
  expect(page.view.allocations).toEqual([]);
  expect(page.history.map((r) => r.allocation)).toEqual([f.fixed(), null]);
  expect(page.view.scope.sources[0]?.version).toBe(2);
  await f.writeAllocation(f.input(2), f.otherGoalId);
});

it("captures exit cutoffs before last-owner release and freezes later co-owner changes", async () => {
  await f.writeAllocation();
  await f.writeAllocation(jointInput(0));
  await leave();
  expect(
    await f.owner.goalAllocation.count({ where: { accountId: f.account } }),
  ).toBe(0);
  expect(
    await f.owner.goalAllocation.count({
      where: { accountId: f.emptyAccount },
    }),
  ).toBe(1);
  const exclusive = await archivePage([f.account]);
  expect(exclusive.history).toHaveLength(1);
  expect(exclusive.view.allocations).toEqual([f.fixed()]);
  const frozen = await archivePage();
  await f.writeAllocation(jointInput(1, "40000"), f.goalId, f.b);
  const after = await archivePage();
  expect(after.history).toEqual(frozen.history);
  expect(after.view.scope).toEqual(frozen.view.scope);
  expect(after.view.allocations).toEqual(frozen.view.allocations);
  expect(after.view.positions[0]?.status).toBe("UNAVAILABLE");
  await expect(f.writeAllocation(jointInput(1))).rejects.toThrow();
  const owner = await f.owner.accountOwner.update({
    where: {
      accountId_userId: { accountId: f.emptyAccount, userId: f.a.userId },
    },
    data: { allocationCutoffVersion: 999 },
  });
  expect(owner.allocationCutoffVersion).toBe(1);
});

it("purges later private allocation history while preserving exact surviving frozen evidence", async () => {
  await f.writeAllocation(jointInput(0));
  await leave();
  const frozen = await archivePage();
  await f.writeAllocation(jointInput(1, "40000"), f.goalId, f.b);
  const deletion = new DeletionRepository(f.runtime);
  const request = await deletion.request(
    f.b,
    randomUUID(),
    randomBytes(32).toString("hex"),
    new Date(Date.now() + 600000),
  );
  const lease = await deletion.claim(request.id);
  if (!lease) throw Error("Missing synthetic deletion lease");
  await deletion.purge(lease.id, lease.leaseToken);
  const retained = await f.owner.accountAllocationRevision.findMany({
    where: { accountId: f.emptyAccount },
    orderBy: { version: "asc" },
  });
  expect(retained.map((r) => r.version)).toEqual([1]);
  expect(retained[0]?.createdAt.toISOString()).toBe(
    frozen.history[0]?.createdAt,
  );
  expect((await archivePage()).history).toEqual(frozen.history);
  const state = await f.owner.accountAllocationState.findUniqueOrThrow({
    where: { accountId: f.emptyAccount },
  });
  expect(state.version).toBe(1);
  expect(state.updatedAt).toEqual(retained[0]?.createdAt);
  await expect(
    f.owner.accountAllocationRevision.deleteMany({
      where: { accountId: f.emptyAccount },
    }),
  ).rejects.toThrow();
  await deletion.purge(lease.id, lease.leaseToken);
  expect((await archivePage()).history).toEqual(frozen.history);
  await deletion.finish(lease.id, lease.leaseToken, true);
});

it("releases an archived source without losing its justified history", async () => {
  await f.writeAllocation();
  await f.owner.account.update({
    where: { id: f.account },
    data: { archivedAt: new Date() },
  });
  expect(
    await f.owner.goalAllocation.count({ where: { accountId: f.account } }),
  ).toBe(0);
  expect(
    (
      await f.owner.accountAllocationRevision.findMany({
        where: { accountId: f.account },
        orderBy: { version: "asc" },
      })
    ).map((r) => r.allocation),
  ).toEqual([f.fixed(), null]);
});

it("rolls back verified releases if a legacy intention blocks goal archive", async () => {
  await f.writeAllocation();
  await f.owner.goalAllocation.create({
    data: {
      householdId: f.hh,
      goalId: f.goalId,
      accountId: f.emptyAccount,
      valuationId: f.emptyValuation,
      basis: "FIXED",
      amountMinor: 1n,
    },
  });
  await expect(
    f.scoped.withScope(
      f.a,
      (tx) =>
        tx.$queryRaw`SELECT app.write_goal(${f.goalId}::uuid,1,${JSON.stringify({ ...f.goalInput, status: "ARCHIVED" })}::jsonb)`,
    ),
  ).rejects.toThrow(/40001/);
  const page = await f.readAllocation();
  expect(page.view.version).toBe(1);
  expect(page.history).toHaveLength(1);
  expect(page.view.allocations).toEqual([f.fixed()]);
});
