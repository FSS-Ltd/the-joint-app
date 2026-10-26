import { randomBytes, randomUUID } from "node:crypto";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ContributionService } from "../apps/api/src/modules/goals/contributions/contribution.service.js";
import { IdentityVault } from "../apps/api/src/modules/identity/identity-vault.js";
import { createContributionFixture } from "./fixtures/contribution-budget.js";
import { contributionCapacity as capacity } from "./fixtures/contribution-plans.js";

let f: ReturnType<typeof createContributionFixture>,
  service: ContributionService;
beforeEach(async () => {
  f = createContributionFixture();
  await f.setup();
  const key = randomBytes(32).toString("base64");
  service = new ContributionService(
    f.scoped,
    f.archive,
    new IdentityVault(key, key),
  );
});
afterEach(async () => {
  vi.restoreAllMocks();
  await f.close();
});

it("replays exact encrypted capacity and plans after complete authority checks", async () => {
  const capacityKey = randomUUID(),
    planKey = randomUUID();
  const initial = await service.writeCapacity(f.a, 0, capacity, capacityKey);
  const first = await service.writePlan(
    f.a,
    f.goalId,
    1,
    f.planInput(),
    planKey,
  );
  await service.writePlan(f.b, f.otherGoalId, 2, f.planInput(), randomUUID());
  expect(
    await service.writeCapacity(f.a, 0, capacity, capacityKey.toUpperCase()),
  ).toEqual(initial);
  expect(
    await service.writePlan(
      f.a,
      f.goalId.toUpperCase(),
      1,
      f.planInput(),
      planKey.toUpperCase(),
    ),
  ).toEqual(first);
  const current = await service.read(f.a);
  expect(current.assessment.months[0]?.shortfall.amountMinor).toBe("10000");
  expect((await service.history(f.a)).history).toHaveLength(3);
  const records = await f.owner.requestKey.findMany({
    where: { userId: f.a.userId },
  });
  expect(records).toHaveLength(2);
  expect(
    records.every((entry) => !entry.resultCiphertext.includes('"amountMinor"')),
  ).toBe(true);
  await expect(
    service.writeCapacity(
      f.a,
      0,
      { ...capacity, horizonMonths: 2 },
      capacityKey,
    ),
  ).rejects.toMatchObject({ status: 409 });
  await f.owner.goalParticipant.delete({
    where: {
      goalId_membershipId: { goalId: f.goalId, membershipId: f.a.membershipId },
    },
  });
  await expect(
    service.writeCapacity(f.a, 0, capacity, capacityKey),
  ).rejects.toMatchObject({ status: 404 });
  await expect(
    service.writePlan(f.a, f.goalId, 1, f.planInput(), planKey),
  ).rejects.toMatchObject({ status: 404 });
});

it("denies revoked sessions before encrypted replay and rolls back malformed writes", async () => {
  const key = randomUUID();
  await service.writeCapacity(f.a, 0, capacity, key);
  await f.owner.sessionRegistry.update({
    where: { id: f.a.sessionId },
    data: { revokedAt: new Date() },
  });
  await expect(
    service.writeCapacity(f.a, 0, capacity, key),
  ).rejects.toMatchObject({ status: 404 });
  await expect(
    service.writePlan(
      f.b,
      f.goalId,
      1,
      { ...f.planInput(), expectedGoalVersion: 0 },
      randomUUID(),
    ),
  ).rejects.toMatchObject({ status: 400 });
  expect((await f.readBudget(f.b)).history).toHaveLength(1);
});

it("binds history cursors to actor, session, membership epoch, goal, archive and operation", async () => {
  await f.writeCapacity();
  for (let version = 1; version <= 51; version += 1)
    await f.writeCapacity(version, {
      ...capacity,
      monthlyContributions: [
        {
          fromMonth: 1,
          amount: { amountMinor: String(version), currency: "GBP" },
        },
      ],
    });
  const first = await service.history(f.a),
    cursor = first.nextCursor ?? "";
  expect(first.history).toHaveLength(50);
  expect(cursor).toBeTruthy();
  expect(
    (await service.history(f.a, undefined, cursor)).history.map(
      (entry) => entry.version,
    ),
  ).toEqual([51, 52]);
  for (const operation of [
    () => service.history(f.b, undefined, cursor),
    () =>
      service.history({ ...f.a, sessionId: randomUUID() }, undefined, cursor),
    () =>
      service.history(
        { ...f.a, grantVersion: f.a.grantVersion + 1 },
        undefined,
        cursor,
      ),
    () => service.history(f.a, f.goalId, cursor),
    () => service.historyArchive(f.a, first.view.budget.id, undefined, cursor),
    () => service.export(f.a, undefined, cursor),
  ])
    await expect(operation()).rejects.toMatchObject({ status: 400 });
  await f.owner.sessionRegistry.update({
    where: { id: f.a.sessionId },
    data: { revokedAt: new Date() },
  });
  await expect(service.history(f.a, undefined, cursor)).rejects.toMatchObject({
    status: 404,
  });
});

it("lists and exports frozen archives without exposing later shared changes", async () => {
  const initial = await service.writeCapacity(f.a, 0, capacity, randomUUID());
  await service.writePlan(f.a, f.goalId, 1, f.planInput(), randomUUID());
  await f.leave();
  expect((await service.listArchive(f.a)).budgets).toEqual([
    { id: initial.budget.id, householdId: f.hh },
  ]);
  expect((await service.listArchive(f.b)).budgets).toEqual([]);
  const frozen = await service.readArchive(f.a, initial.budget.id);
  await service.writePlan(f.b, f.goalId, 2, f.planInput("1", 1), randomUUID());
  expect((await service.exportArchive(f.a, initial.budget.id)).view).toEqual(
    frozen,
  );
  await expect(
    service.readArchive(f.b, initial.budget.id),
  ).rejects.toMatchObject({ status: 404 });
});

it("keeps future-intent exports free after downgrade and requires fresh MFA", async () => {
  await f.writeCapacity();
  const grant = randomUUID();
  try {
    await f.owner
      .$executeRaw`INSERT INTO app."EntitlementGrant"(id,"householdId","membershipId","userId",issuer,reason,"issuedAt","expiresAt",capabilities) VALUES(${grant}::uuid,${f.hh}::uuid,${f.a.membershipId}::uuid,${f.a.userId}::uuid,'Synthetic operator','Synthetic contribution trial',clock_timestamp(),clock_timestamp()+interval '1 day',ARRAY['connections.broker'])`;
    expect((await service.export(f.a)).history).toHaveLength(1);
    await f.owner
      .$executeRaw`UPDATE app."EntitlementGrant" SET "revokedAt"=clock_timestamp() WHERE id=${grant}::uuid`;
    expect((await service.export(f.a)).history).toHaveLength(1);
    await expect(
      service.export({ ...f.a, mfaAuthenticatedAt: Date.now() - 300001 }),
    ).rejects.toMatchObject({ status: 403 });
  } finally {
    await f.owner
      .$executeRaw`DELETE FROM app."EntitlementGrant" WHERE id=${grant}::uuid`;
    await f.owner
      .$executeRaw`DELETE FROM app."EntitlementGrantAudit" WHERE "grantId"=${grant}::uuid`;
  }
});

it("rechecks export MFA freshness after a real household-lock wait", async () => {
  await f.writeCapacity();
  const now = Date.now(),
    actor = { ...f.a, mfaAuthenticatedAt: now - 299000 };
  let pending: Promise<unknown> | undefined;
  try {
    await f.owner.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM app."Household" WHERE id=${f.hh}::uuid FOR UPDATE`;
      pending = service.export(actor).then(
        (value) => ({ value }),
        (error: unknown) => ({ error }),
      );
      await vi.waitFor(async () => {
        await tx.$executeRaw`SELECT pg_stat_clear_snapshot()`;
        const [row] = await tx.$queryRaw<
          { waiting: boolean }[]
        >`SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND query LIKE '%app.read_contribution_budget%' AND wait_event_type='Lock') AS waiting`;
        expect(row?.waiting).toBe(true);
      });
      vi.spyOn(Date, "now").mockReturnValue(now + 1100);
    });
    expect(await pending).toMatchObject({ error: { status: 403 } });
  } finally {
    await pending;
  }
});
