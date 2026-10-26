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

it("records exact owner intentions without changing balances or goal metadata", async () => {
  const before = await f.owner.balanceSnapshot.findMany({
    where: { accountId: f.account },
  });
  const page = await f.writeAllocation();
  expect(page.view.version).toBe(1);
  expect(page.view.scope.sources).toEqual([
    { accountId: f.account, version: 1 },
  ]);
  expect(page.view.positions[0]?.available?.amountMinor).toBe("50000");
  expect(page.view.positions[0]?.allocated?.amountMinor).toBe("30000");
  expect(page.history).toHaveLength(1);
  expect(
    await f.owner.balanceSnapshot.findMany({ where: { accountId: f.account } }),
  ).toEqual(before);
  expect(
    (await f.owner.goal.findUniqueOrThrow({ where: { id: f.goalId } })).version,
  ).toBe(1);
});

it("serializes competing goals and rejects a retry that exceeds source capacity", async () => {
  const result = await Promise.allSettled([
    f.writeAllocation(),
    f.writeAllocation(f.input(), f.otherGoalId),
  ]);
  expect(result.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  expect(result.filter((r) => r.status === "rejected")).toHaveLength(1);
  const remaining =
    result[0]?.status === "fulfilled" ? f.otherGoalId : f.goalId;
  await expect(f.writeAllocation(f.input(1), remaining)).rejects.toThrow(
    /P0005/,
  );
  expect(
    await f.owner.goalAllocation.count({ where: { accountId: f.account } }),
  ).toBe(1);
});

it("serializes joint owners on one canonical source", async () => {
  const body = {
    accountIds: [f.emptyAccount],
    sourceVersions: [{ accountId: f.emptyAccount, version: 0 }],
    allocations: [f.fixed(f.emptyAccount, "30000", f.emptyValuation)],
  };
  const results = await Promise.allSettled([
    f.writeAllocation(body),
    f.writeAllocation(body, f.otherGoalId, f.b),
  ]);
  expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  expect(
    await f.owner.accountAllocationRevision.count({
      where: { accountId: f.emptyAccount },
    }),
  ).toBe(1);
});

it("rolls back an entire selected batch when one source cannot fund it", async () => {
  const body = {
    accountIds: [f.account, f.emptyAccount],
    sourceVersions: [
      { accountId: f.account, version: 0 },
      { accountId: f.emptyAccount, version: 0 },
    ],
    allocations: [
      f.fixed(),
      f.fixed(f.emptyAccount, "60000", f.emptyValuation),
    ],
  };
  await expect(f.writeAllocation(body)).rejects.toThrow(/P0005/);
  expect(
    await f.owner.accountAllocationRevision.count({
      where: { householdId: f.hh },
    }),
  ).toBe(0);
  expect(
    await f.owner.goalAllocation.count({ where: { householdId: f.hh } }),
  ).toBe(0);
});

it("rejects stale goal and source versions without recording another revision", async () => {
  await f.writeAllocation();
  await expect(f.writeAllocation()).rejects.toThrow(/40001/);
  await expect(f.writeAllocation(f.input(1), f.goalId, f.a, 2)).rejects.toThrow(
    /40001/,
  );
  expect((await f.readAllocation()).history).toHaveLength(1);
});

it("denies grants, missing sources and mixed selections before capacity details", async () => {
  await expect(f.readAllocation(f.b)).rejects.toThrow(/P0002/);
  await expect(f.writeAllocation(f.input(), f.goalId, f.b)).rejects.toThrow(
    /P0002/,
  );
  const missing = randomUUID();
  for (const id of [f.account, missing]) {
    const body = {
      accountIds: [f.emptyAccount, id],
      sourceVersions: [
        { accountId: f.emptyAccount, version: 0 },
        { accountId: id, version: 0 },
      ],
      allocations: [],
    };
    await expect(f.writeAllocation(body, f.goalId, f.b)).rejects.toThrow(
      /P0002/,
    );
  }
  expect(
    await f.owner.accountAllocationRevision.count({
      where: { householdId: f.hh },
    }),
  ).toBe(0);
});

it("uses exact half-up fractions and preserves their historic settlement after a valuation fall", async () => {
  await f.writeAllocation(
    f.input(0, [
      {
        basis: "FRACTION",
        accountId: f.account,
        valuationId: f.valuation,
        fraction: "0.00001",
      },
    ]),
  );
  expect(
    (await f.readAllocation()).view.positions[0]?.allocated?.amountMinor,
  ).toBe("1");
  const valuationId = randomUUID();
  await f.owner.balanceSnapshot.create({
    data: {
      id: valuationId,
      householdId: f.hh,
      accountId: f.account,
      authorMembershipId: f.a.membershipId,
      amountMinor: 0n,
      adultAmountMinor: 0n,
      asOfDate: new Date(new Date().toISOString().slice(0, 10)),
      createdAt: new Date(Date.now() + 1000),
    },
  });
  await f.write(f.a, 1, {
    valuationId,
    settledAdultMoney: { amountMinor: "0", currency: "GBP" },
    billReserves: { amountMinor: "0", currency: "GBP" },
  });
  const position = (await f.readAllocation()).view.positions[0];
  expect(position?.status).toBe("UNDERFUNDED");
  expect(position?.allocated?.amountMinor).toBe("1");
  expect(position?.shortfall?.amountMinor).toBe("1");
  await f.writeAllocation(f.input(1, []));
  expect(
    (await f.readAllocation()).view.positions[0]?.committed?.amountMinor,
  ).toBe("0");
});

it("permits reductions under reserve excess and release when evidence is unavailable", async () => {
  await f.writeAllocation();
  await f.write(f.a, 1, {
    ...f.data,
    settledAdultMoney: { amountMinor: "50000", currency: "GBP" },
    billReserves: { amountMinor: "60000", currency: "GBP" },
  });
  expect(
    (await f.readAllocation()).view.positions[0]?.available?.amountMinor,
  ).toBe("0");
  await f.writeAllocation(f.input(1, [f.fixed(f.account, "20000")]));
  await expect(
    f.writeAllocation(f.input(2, [f.fixed(f.account, "25000")])),
  ).rejects.toThrow(/P0005/);
  await f.owner.account.update({
    where: { id: f.account },
    data: { liquidity: "RESTRICTED" },
  });
  expect((await f.readAllocation()).view.positions[0]?.status).toBe(
    "UNAVAILABLE",
  );
  await expect(
    f.writeAllocation(f.input(2, [f.fixed(f.account, "10000")])),
  ).rejects.toThrow(/P0003/);
  await f.writeAllocation(f.input(2, []));
  expect((await f.readAllocation()).view.allocations).toEqual([]);
});

it("rejects unverified legacy commitments instead of admitting against incomplete totals", async () => {
  await f.owner.goalAllocation.create({
    data: {
      householdId: f.hh,
      goalId: f.otherGoalId,
      accountId: f.account,
      valuationId: f.valuation,
      basis: "FIXED",
      amountMinor: 1n,
    },
  });
  await expect(f.writeAllocation()).rejects.toThrow(/P0003/);
  expect((await f.readAllocation()).view.positions[0]?.status).toBe(
    "UNAVAILABLE",
  );
});

it("keeps unchanged intentions idempotent at the database boundary", async () => {
  await f.writeAllocation();
  const before = await f.owner.accountAllocationRevision.findMany({
    where: { accountId: f.account },
  });
  await f.writeAllocation(f.input(1));
  expect(
    await f.owner.accountAllocationRevision.findMany({
      where: { accountId: f.account },
    }),
  ).toEqual(before);
});

it("preserves other selected-source owners' intentions and rejects cross-household resources", async () => {
  const joint = {
    accountIds: [f.emptyAccount],
    sourceVersions: [{ accountId: f.emptyAccount, version: 0 }],
    allocations: [f.fixed(f.emptyAccount, "10000", f.emptyValuation)],
  };
  await f.writeAllocation(joint, f.goalId, f.b);
  await f.writeAllocation();
  await f.writeAllocation(f.input(1, []));
  expect(
    (await f.readAllocation(f.b, [f.emptyAccount])).view.allocations,
  ).toEqual(joint.allocations);
  const foreign = createGoalAllocationFixture();
  try {
    await foreign.setup();
    await expect(f.readAllocation(f.a, [foreign.account])).rejects.toThrow(
      /P0002/,
    );
    await expect(
      f.readAllocation(f.a, [f.account], foreign.goalId),
    ).rejects.toThrow(/P0002/);
  } finally {
    await foreign.close();
  }
});

it("retains integer precision beyond JavaScript's safe-number boundary", async () => {
  const valuationId = randomUUID();
  await f.owner.balanceSnapshot.create({
    data: {
      id: valuationId,
      householdId: f.hh,
      accountId: f.account,
      authorMembershipId: f.a.membershipId,
      amountMinor: 9007199254740993n,
      adultAmountMinor: 9007199254740993n,
      asOfDate: new Date(new Date().toISOString().slice(0, 10)),
      createdAt: new Date(Date.now() + 1000),
    },
  });
  await f.write(f.a, 1, {
    valuationId,
    settledAdultMoney: { amountMinor: "9007199254740993", currency: "GBP" },
    billReserves: { amountMinor: "0", currency: "GBP" },
  });
  const page = await f.writeAllocation(
    f.input(0, [f.fixed(f.account, "9007199254740993", valuationId)]),
  );
  expect(page.view.positions[0]?.allocated?.amountMinor).toBe(
    "9007199254740993",
  );
  expect(page.view.positions[0]?.available?.amountMinor).toBe(
    "9007199254740993",
  );
});
