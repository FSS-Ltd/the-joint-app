import { randomBytes, randomUUID } from "node:crypto";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { GoalAllocationService } from "../apps/api/src/modules/goals/allocations/allocation.service.js";
import { IdentityVault } from "../apps/api/src/modules/identity/identity-vault.js";
import { createGoalAllocationFixture } from "./fixtures/goal-allocation.js";

let f: ReturnType<typeof createGoalAllocationFixture>;
let service: GoalAllocationService;
beforeEach(async () => {
  f = createGoalAllocationFixture();
  await f.setup();
  const key = randomBytes(32).toString("base64");
  service = new GoalAllocationService(
    f.scoped,
    f.archive,
    new IdentityVault(key, key),
  );
});
afterEach(async () => {
  vi.restoreAllMocks();
  await f.close();
});

it("canonicalizes selected source order and UUID case for encrypted exact replay", async () => {
  const key = randomUUID(),
    body = {
      accountIds: [f.account, f.emptyAccount],
      sourceVersions: [
        { accountId: f.account, version: 0 },
        { accountId: f.emptyAccount, version: 0 },
      ],
      allocations: [
        f.fixed(f.account, "10000"),
        f.fixed(f.emptyAccount, "20000", f.emptyValuation),
      ],
    };
  const made = await service.write(f.a, f.goalId, 1, body, key);
  const equivalent = {
    accountIds: [...body.accountIds].reverse().map((id) => id.toUpperCase()),
    sourceVersions: [...body.sourceVersions].reverse().map((source) => ({
      ...source,
      accountId: source.accountId.toUpperCase(),
    })),
    allocations: [...body.allocations].reverse().map((entry) => ({
      ...entry,
      accountId: entry.accountId.toUpperCase(),
      valuationId: entry.valuationId.toUpperCase(),
    })),
  };
  expect(
    await service.write(
      f.a,
      f.goalId.toUpperCase(),
      1,
      equivalent,
      key.toUpperCase(),
    ),
  ).toEqual(made);
  expect(
    await f.owner.accountAllocationRevision.count({
      where: { householdId: f.hh },
    }),
  ).toBe(2);
  const records = await f.owner.requestKey.findMany({
    where: { userId: f.a.userId },
  });
  expect(records).toHaveLength(1);
  expect(records[0]?.resultCiphertext).not.toContain('"amountMinor"');
  await expect(
    service.write(f.a, f.goalId, 1, f.input(), key),
  ).rejects.toMatchObject({ status: 409 });
});

it("reauthorizes every selected owner before replay and never returns revoked private data", async () => {
  const key = randomUUID();
  await service.write(f.a, f.goalId, 1, f.input(), key);
  await f.owner.accountOwner.update({
    where: { accountId_userId: { accountId: f.account, userId: f.a.userId } },
    data: { status: "ARCHIVED" },
  });
  await expect(
    service.write(f.a, f.goalId, 1, f.input(), key),
  ).rejects.toMatchObject({ status: 404 });
});

it("rejects a revoked session before returning encrypted replay", async () => {
  const key = randomUUID();
  await service.write(f.a, f.goalId, 1, f.input(), key);
  await f.owner.sessionRegistry.update({
    where: { id: f.a.sessionId },
    data: { revokedAt: new Date() },
  });
  await expect(
    service.write(f.a, f.goalId, 1, f.input(), key),
  ).rejects.toMatchObject({ status: 404 });
});

it("maps funding conflicts without exposing database details", async () => {
  await expect(
    service.write(
      f.a,
      f.goalId,
      1,
      f.input(0, [f.fixed(f.account, "60000")]),
      randomUUID(),
    ),
  ).rejects.toMatchObject({
    status: 409,
    response: { error: { code: "ALLOCATION_EXCEEDS_AVAILABLE" } },
  });
  await f.owner.account.update({
    where: { id: f.account },
    data: { liquidity: "RESTRICTED" },
  });
  await expect(
    service.write(f.a, f.goalId, 1, f.input(), randomUUID()),
  ).rejects.toMatchObject({
    status: 409,
    response: { error: { code: "FUNDING_UNAVAILABLE" } },
  });
});

it("binds bounded encrypted history to source selection, goal, session, actor and archive mode", async () => {
  for (let version = 0; version < 52; version++)
    await f.writeAllocation(
      f.input(version, [f.fixed(f.account, String(version + 1))]),
    );
  const first = await service.read(f.a, f.goalId, [f.account]);
  expect(first.history).toHaveLength(50);
  expect(first.nextCursor).toBeTruthy();
  const cursor = first.nextCursor ?? "";
  expect(
    (await service.read(f.a, f.goalId, [f.account], cursor)).history.map(
      (entry) => entry.version,
    ),
  ).toEqual([51, 52]);
  await expect(
    service.read(f.a, f.goalId, [f.emptyAccount], cursor),
  ).rejects.toMatchObject({ status: 400 });
  await expect(
    service.read(f.a, f.otherGoalId, [f.account], cursor),
  ).rejects.toMatchObject({ status: 400 });
  await expect(
    service.read(f.b, f.goalId, [f.account], cursor),
  ).rejects.toMatchObject({ status: 400 });
  await expect(
    service.read(
      { ...f.a, sessionId: randomUUID() },
      f.goalId,
      [f.account],
      cursor,
    ),
  ).rejects.toMatchObject({ status: 400 });
  await expect(
    service.readArchive(f.a, f.goalId, [f.account], cursor),
  ).rejects.toMatchObject({ status: 400 });
});

it("freezes archived source and goal history before later co-owner changes", async () => {
  const body = {
    accountIds: [f.emptyAccount],
    sourceVersions: [{ accountId: f.emptyAccount, version: 0 }],
    allocations: [f.fixed(f.emptyAccount, "10000", f.emptyValuation)],
  };
  await service.write(f.a, f.goalId, 1, body, randomUUID());
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
  const frozen = await service.readArchive(f.a, f.goalId, [f.emptyAccount]);
  await service.write(
    f.b,
    f.goalId,
    1,
    {
      ...body,
      sourceVersions: [{ accountId: f.emptyAccount, version: 1 }],
      allocations: [f.fixed(f.emptyAccount, "20000", f.emptyValuation)],
    },
    randomUUID(),
  );
  expect(
    (await service.exportArchive(f.a, f.goalId, [f.emptyAccount])).history,
  ).toEqual(frozen.history);
  expect(frozen.view.allocations).toEqual(body.allocations);
});

it("keeps exports free after a synthetic downgrade and requires fresh MFA", async () => {
  await service.write(f.a, f.goalId, 1, f.input(), randomUUID());
  const grant = randomUUID();
  try {
    await f.owner
      .$executeRaw`INSERT INTO app."EntitlementGrant"(id,"householdId","membershipId","userId",issuer,reason,"issuedAt","expiresAt",capabilities) VALUES(${grant}::uuid,${f.hh}::uuid,${f.a.membershipId}::uuid,${f.a.userId}::uuid,'Synthetic operator','Synthetic allocation trial',clock_timestamp(),clock_timestamp()+interval '1 day',ARRAY['connections.broker'])`;
    expect(
      (await service.export(f.a, f.goalId, [f.account])).history,
    ).toHaveLength(1);
    await f.owner
      .$executeRaw`UPDATE app."EntitlementGrant" SET "revokedAt"=clock_timestamp() WHERE id=${grant}::uuid`;
    expect(
      (await service.export(f.a, f.goalId, [f.account])).history,
    ).toHaveLength(1);
    await expect(
      service.export(
        { ...f.a, mfaAuthenticatedAt: Date.now() - 300001 },
        f.goalId,
        [f.account],
      ),
    ).rejects.toMatchObject({ status: 403 });
  } finally {
    await f.owner
      .$executeRaw`DELETE FROM app."EntitlementGrant" WHERE id=${grant}::uuid`;
    await f.owner
      .$executeRaw`DELETE FROM app."EntitlementGrantAudit" WHERE "grantId"=${grant}::uuid`;
  }
});

it("rechecks export MFA freshness after waiting for a source lock", async () => {
  const now = Date.now(),
    context = { ...f.a, mfaAuthenticatedAt: now - 299000 };
  let pending: Promise<unknown> | undefined;
  try {
    await f.owner.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM app."Account" WHERE id=${f.account}::uuid FOR UPDATE`;
      pending = service.export(context, f.goalId, [f.account]).then(
        (value) => ({ value }),
        (error: unknown) => ({ error }),
      );
      await vi.waitFor(async () => {
        await tx.$executeRaw`SELECT pg_stat_clear_snapshot()`;
        const [row] = await tx.$queryRaw<
          { waiting: boolean }[]
        >`SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND query LIKE '%app.read_goal_allocations%' AND wait_event_type='Lock') AS waiting`;
        expect(row?.waiting).toBe(true);
      });
      vi.spyOn(Date, "now").mockReturnValue(now + 1100);
    });
    expect(await pending).toMatchObject({ error: { status: 403 } });
  } finally {
    await pending;
    vi.restoreAllMocks();
  }
});
