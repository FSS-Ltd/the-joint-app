import { randomBytes, randomUUID } from "node:crypto";
import { afterAll, beforeAll, expect, it } from "vitest";
import type { AuthContext, GoalDto } from "../packages/contracts/dist/index.js";
import { createOrm, type Prisma } from "../packages/database/dist/client.js";
import { ScopedDatabase } from "../packages/database/dist/scoped-transaction.js";
import { ArchiveDatabase } from "../packages/database/dist/archive-transaction.js";
import { createFixtureOwner } from "./fixtures/database.js";
import { GoalService } from "../apps/api/src/modules/goals/goals.service.js";
import { IdentityVault } from "../apps/api/src/modules/identity/identity-vault.js";
const owner = createFixtureOwner();
if (!process.env.DATABASE_URL) throw Error("Local runtime database required");
const runtime = createOrm(process.env.DATABASE_URL),
  scoped = new ScopedDatabase(runtime),
  archive = new ArchiveDatabase(runtime);
const key = randomBytes(32).toString("base64"),
  service = new GoalService(scoped, archive, new IdentityVault(key, key));
const hh = randomUUID(),
  otherHh = randomUUID();
function actor(householdId = hh): AuthContext {
  return {
    userId: randomUUID(),
    membershipId: randomUUID(),
    sessionId: randomUUID(),
    householdId,
    grantVersion: 0,
    aal: "aal2",
    mfaAuthenticatedAt: Date.now(),
    requestId: randomUUID(),
  };
}
const a = actor(),
  b = actor(),
  outsider = actor(otherHh),
  replacement = actor();
const actors = [a, b, outsider, replacement];
const input = {
  name: "Shared synthetic goal",
  status: "ACTIVE",
  beneficiary: "ADULT",
  priority: 1,
  target: { amountMinor: "9007199254740993", currency: "GBP" },
  targetDate: "2028-02-29",
};
async function write(
  c: AuthContext,
  id: string,
  version: number,
  data: unknown = input,
): Promise<GoalDto> {
  return scoped.withScope(c, async (tx) => {
    const [row] = await tx.$queryRaw<
      { data: GoalDto }[]
    >`SELECT app.write_goal(${id}::uuid,${version}::integer,${JSON.stringify(data)}::jsonb) AS data`;
    if (!row) throw Error("Missing test result");
    return row.data;
  });
}
async function page(tx: Prisma.TransactionClient, id: string, version = 0) {
  const [row] = await tx.$queryRaw<
    {
      data: {
        goal: GoalDto;
        revisions: { goal: GoalDto }[];
        nextAfterVersion: number | null;
      };
    }[]
  >`SELECT app.read_goal(${id}::uuid,${version}::integer) AS data`;
  return row?.data;
}
const goal = randomUUID(),
  legacy = randomUUID();
beforeAll(async () => {
  await owner.household.createMany({ data: [{ id: hh }, { id: otherHh }] });
  for (const [i, c] of actors.entries()) {
    await owner.user.create({ data: { id: c.userId } });
    if (c !== replacement)
      await owner.membership.create({
        data: {
          id: c.membershipId,
          userId: c.userId,
          householdId: c.householdId,
          slot: c === outsider ? 1 : i + 1,
        },
      });
    await owner.sessionRegistry.create({
      data: {
        id: c.sessionId,
        userId: c.userId,
        householdId: c === replacement ? null : c.householdId,
        expiresAt: new Date(Date.now() + 600000),
      },
    });
  }
  await owner.goal.create({
    data: {
      id: legacy,
      householdId: hh,
      name: "Unclassified legacy",
      priority: 1,
      targetMinor: 1n,
    },
  });
});
afterAll(async () => {
  await owner.household.deleteMany({ where: { id: { in: [hh, otherHh] } } });
  await owner.sessionRegistry.deleteMany({
    where: { userId: { in: actors.map((c) => c.userId) } },
  });
  await owner.user.deleteMany({
    where: { id: { in: actors.map((c) => c.userId) } },
  });
  await Promise.all([owner.$disconnect(), runtime.$disconnect()]);
});
it("creates metadata shared with both current adults without account access", async () => {
  const made = await write(a, goal, 0);
  expect(made).toMatchObject({
    ...input,
    id: goal,
    householdId: hh,
    version: 1,
  });
  expect(await scoped.withScope(b, (tx) => page(tx, goal))).toMatchObject({
    goal: made,
    revisions: [{ goal: made }],
    nextAfterVersion: null,
  });
  expect(JSON.stringify(made)).not.toMatch(
    /account|funding|settled|allocation|userId/i,
  );
});
it("retains immutable history and serializes competing optimistic edits", async () => {
  const results = await Promise.allSettled([
    write(a, goal, 1, { ...input, name: "First edit" }),
    write(b, goal, 1, { ...input, name: "Second edit" }),
  ]);
  expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  expect(results.filter((r) => r.status === "rejected")).toHaveLength(1);
  const result = await scoped.withScope(a, (tx) => page(tx, goal));
  expect(result?.goal.version).toBe(2);
  expect(result?.revisions.map((r) => r.goal.version)).toEqual([1, 2]);
  expect(result?.revisions[0]?.goal.name).toBe(input.name);
  await expect(
    owner.$executeRaw`UPDATE app."GoalRevision" SET data='{}'::jsonb WHERE "goalId"=${goal}::uuid`,
  ).rejects.toThrow();
});
it("denies wrong household, legacy and unscoped access without table privileges", async () => {
  await expect(
    scoped.withScope(outsider, (tx) => page(tx, goal)),
  ).rejects.toThrow();
  await expect(scoped.withScope(a, (tx) => page(tx, legacy))).rejects.toThrow();
  await expect(
    runtime.$queryRaw`SELECT app.read_goal(${goal}::uuid,0)`,
  ).rejects.toThrow();
  for (const table of [
    "Goal",
    "GoalRevision",
    "GoalParticipant",
    "GoalAllocation",
    "ContributionPlan",
    "ProjectionRun",
  ]) {
    const [row] = await owner.$queryRaw<
      { allowed: boolean }[]
    >`SELECT has_table_privilege('joint_app_runtime',${`app."${table}"`},'SELECT,INSERT,UPDATE,DELETE') AS allowed`;
    expect(row?.allowed).toBe(false);
  }
});
it("rejects malformed SQL boundary input without modifying history", async () => {
  for (const bad of [
    { ...input, status: null },
    { ...input, private: "hidden" },
    { ...input, priority: 1.5 },
    { ...input, targetDate: "2027-02-29" },
    { ...input, target: { amountMinor: "01", currency: "GBP" } },
    { ...input, status: "ARCHIVED" },
  ])
    await expect(write(a, randomUUID(), 0, bad)).rejects.toThrow();
});
it("freezes exit history and prevents replacement-member inheritance", async () => {
  await scoped.withScope(b, (tx) => tx.$queryRaw`SELECT app.leave_household()`);
  // Exit revokes household sessions. Simulate each adult's independently verified sign-in.
  for (const c of [a, b])
    await owner.sessionRegistry.update({
      where: { id: c.sessionId },
      data: { revokedAt: null, householdId: c === b ? null : hh },
    });
  a.grantVersion = (
    await owner.membership.findUniqueOrThrow({ where: { id: a.membershipId } })
  ).grantVersion;
  await write(a, goal, 2, { ...input, name: "After separation" });
  const frozen = await archive.withScope(b, (tx) => page(tx, goal));
  expect(frozen?.goal.version).toBe(2);
  expect(frozen?.revisions.map((r) => r.goal.version)).toEqual([1, 2]);
  await owner.membership.create({
    data: {
      id: replacement.membershipId,
      householdId: hh,
      userId: replacement.userId,
      slot: 2,
    },
  });
  await owner.sessionRegistry.update({
    where: { id: replacement.sessionId },
    data: { householdId: hh },
  });
  await expect(
    scoped.withScope(replacement, (tx) => page(tx, goal)),
  ).rejects.toThrow();
  const next = await write(a, randomUUID(), 0);
  expect(
    await scoped.withScope(replacement, (tx) => page(tx, next.id)),
  ).toMatchObject({ goal: next });
});
it("archives read-only without erasing prior revisions", async () => {
  const closed = await write(a, goal, 3, { ...input, status: "ARCHIVED" });
  expect(closed.version).toBe(4);
  await expect(write(a, goal, 4, input)).rejects.toThrow();
  expect(
    (await scoped.withScope(a, (tx) => page(tx, goal)))?.revisions,
  ).toHaveLength(4);
});
it("bounds and resumes history and list pages without duplicates", async () => {
  const id = randomUUID();
  await write(a, id, 0);
  for (let version = 1; version < 52; version++)
    await write(a, id, version, { ...input, priority: version + 1 });
  const first = await scoped.withScope(a, (tx) => page(tx, id));
  expect(first?.revisions).toHaveLength(50);
  expect(first?.nextAfterVersion).toBe(50);
  const last = await scoped.withScope(a, (tx) => page(tx, id, 50));
  expect(last?.revisions.map((r) => r.goal.version)).toEqual([51, 52]);
  expect(last?.nextAfterVersion).toBeNull();
  const publicPage = await service.read(a, id.toUpperCase());
  expect(publicPage.revisions).toHaveLength(50);
  expect(publicPage.nextCursor).toBeTypeOf("string");
  const publicNext = await service.export(
    { ...a, mfaAuthenticatedAt: Date.now() },
    id,
    publicPage.nextCursor ?? undefined,
  );
  expect(publicNext.revisions.map((r) => r.goal.version)).toEqual([51, 52]);
  await expect(
    service.read(outsider, id, publicPage.nextCursor ?? undefined),
  ).rejects.toMatchObject({ status: 400 });
  await expect(
    service.readArchive(b, id, publicPage.nextCursor ?? undefined),
  ).rejects.toMatchObject({ status: 400 });
  const alternate = await write(a, randomUUID(), 0);
  await expect(
    service.read(a, alternate.id, publicPage.nextCursor ?? undefined),
  ).rejects.toMatchObject({ status: 400 });
  for (let i = 0; i < 49; i++) await write(a, randomUUID(), 0);
  const listing = await service.list(a);
  expect(listing.goals).toHaveLength(50);
  const more = await service.list(a, listing.nextCursor ?? undefined);
  expect(more.goals.length).toBeGreaterThan(0);
  expect(new Set([...listing.goals, ...more.goals].map((g) => g.id)).size).toBe(
    listing.goals.length + more.goals.length,
  );

  const [list] = await scoped.withScope(
    a,
    (tx) =>
      tx.$queryRaw<
        { data: { goals: GoalDto[] } }[]
      >`SELECT app.list_goals(NULL::uuid) AS data`,
  );
  expect(list?.data.goals.every((g) => g.householdId === hh)).toBe(true);
});
it("purges a deleted adult's exclusive history but retains independently shared records", async () => {
  const soloHh = randomUUID();
  await owner.household.create({ data: { id: soloHh } });
  const solo = actor(soloHh);
  await owner.user.create({
    data: {
      id: solo.userId,
      memberships: {
        create: { id: solo.membershipId, householdId: soloHh, slot: 1 },
      },
      sessions: {
        create: {
          id: solo.sessionId,
          householdId: soloHh,
          expiresAt: new Date(Date.now() + 600000),
        },
      },
    },
  });
  try {
    const only = await write(solo, randomUUID(), 0);
    await owner.user.update({
      where: { id: solo.userId },
      data: { status: "DELETED" },
    });
    expect(await owner.goal.findUnique({ where: { id: only.id } })).toBeNull();
    await owner.user.update({
      where: { id: b.userId },
      data: { status: "DELETED" },
    });
    expect(await owner.goal.findUnique({ where: { id: goal } })).not.toBeNull();
    await expect(
      archive.withScope(b, (tx) => page(tx, goal)),
    ).rejects.toThrow();
  } finally {
    await owner.household.delete({ where: { id: soloHh } });
    await owner.sessionRegistry.deleteMany({ where: { userId: solo.userId } });
    await owner.user.delete({ where: { id: solo.userId } });
  }
});
