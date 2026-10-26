import { ScopedDatabase } from "../packages/database/dist/scoped-transaction.js";
import { ArchiveDatabase } from "../packages/database/dist/archive-transaction.js";
import { randomUUID } from "node:crypto";
import { afterAll, expect, it } from "vitest";
import { createOrm } from "../packages/database/dist/client.js";
import { databaseErrorCode } from "../apps/api/src/database-error.js";
import { createFixtureOwner } from "./fixtures/database.js";

const owner = createFixtureOwner();
const runtime = createOrm(process.env.DATABASE_URL ?? "");
const users: string[] = [];
const households: string[] = [];
async function session() {
  const userId = randomUUID();
  users.push(userId);
  await owner.user.create({ data: { id: userId, emailHash: randomUUID() } });
  return owner.sessionRegistry.create({
    data: {
      id: randomUUID(),
      userId,
      kind: "BEARER",
      expiresAt: new Date(Date.now() + 86_400_000),
    },
  });
}
async function deadline(id: string, age: number | null = null) {
  const [row] = await runtime.$queryRaw<
    { expiresAt: Date; serverTime: Date }[]
  >`
    SELECT * FROM app.session_idle_deadline(${id}::uuid,${age}::integer)`;
  if (!row) throw new Error("Missing session deadline");
  return row;
}
afterAll(async () => {
  await owner.sessionRegistry.deleteMany({ where: { userId: { in: users } } });
  await owner.household.deleteMany({ where: { id: { in: households } } });
  await owner.user.deleteMany({ where: { id: { in: users } } });
  await runtime.$disconnect();
  await owner.$disconnect();
});
it("passive reads preserve the ten-minute deadline and activity renews only its session", async () => {
  const first = await session(),
    second = await session();
  await owner.sessionRegistry.update({
    where: { id: first.id },
    data: { lastSeenAt: new Date(Date.now() - 300_000) },
  });
  const before = await owner.sessionRegistry.findUniqueOrThrow({
    where: { id: first.id },
  });
  const read = await deadline(first.id);
  expect(read.expiresAt.getTime()).toBe(before.lastSeenAt.getTime() + 600_000);
  expect(
    (await owner.sessionRegistry.findUniqueOrThrow({ where: { id: first.id } }))
      .lastSeenAt,
  ).toEqual(before.lastSeenAt);
  const active = await deadline(first.id, 2000);
  expect(active.expiresAt.getTime() - active.serverTime.getTime()).toBe(
    598_000,
  );
  expect(
    (
      await owner.sessionRegistry.findUniqueOrThrow({
        where: { id: second.id },
      })
    ).lastSeenAt,
  ).toEqual(second.lastSeenAt);
});
it("late activity and passive reads cannot revive an idle session", async () => {
  const row = await session();
  await owner.sessionRegistry.update({
    where: { id: row.id },
    data: { lastSeenAt: new Date(Date.now() - 601_000) },
  });
  await expect(deadline(row.id)).rejects.toSatisfy(
    (error: unknown) => databaseErrorCode(error) === "42501",
  );
  await expect(deadline(row.id, 0)).rejects.toSatisfy(
    (error: unknown) => databaseErrorCode(error) === "42501",
  );
});
it("activity respects absolute expiry, revocation and strict age bounds", async () => {
  const row = await session();
  const hard = new Date(Date.now() + 30_000);
  await owner.sessionRegistry.update({
    where: { id: row.id },
    data: { expiresAt: hard },
  });
  expect((await deadline(row.id, 0)).expiresAt).toEqual(hard);
  await expect(deadline(row.id, -1)).rejects.toSatisfy(
    (error: unknown) => databaseErrorCode(error) === "42501",
  );
  await expect(deadline(row.id, 5001)).rejects.toSatisfy(
    (error: unknown) => databaseErrorCode(error) === "42501",
  );
  await owner.sessionRegistry.update({
    where: { id: row.id },
    data: { revokedAt: new Date() },
  });
  await expect(deadline(row.id, 0)).rejects.toSatisfy(
    (error: unknown) => databaseErrorCode(error) === "42501",
  );
});

it("captured financial and archive scopes lose authority after inactivity", async () => {
  const row = await session();
  const household = await owner.household.create({ data: {} });
  households.push(household.id);
  const member = await owner.membership.create({
    data: { userId: row.userId, householdId: household.id, slot: 1 },
  });
  await owner.sessionRegistry.update({
    where: { id: row.id },
    data: { householdId: household.id },
  });
  const context = {
    userId: row.userId,
    sessionId: row.id,
    membershipId: member.id,
    householdId: household.id,
    grantVersion: member.grantVersion,
    requestId: randomUUID(),
    aal: "aal2" as const,
    mfaAuthenticatedAt: Date.now() - 1000,
  };
  const scoped = new ScopedDatabase(runtime),
    archive = new ArchiveDatabase(runtime);
  expect(await scoped.withScope(context, async () => true)).toBe(true);
  expect(await archive.withScope(context, async () => true)).toBe(true);
  await owner.sessionRegistry.update({
    where: { id: row.id },
    data: { lastSeenAt: new Date(Date.now() - 601_000) },
  });
  await expect(scoped.withScope(context, async () => true)).rejects.toThrow(
    "Authorization scope is no longer valid",
  );
  await expect(archive.withScope(context, async () => true)).rejects.toThrow(
    "Archive session is no longer valid",
  );
  const [permission] = await runtime.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT set_config('joint.user_id',${row.userId},true),set_config('joint.session_id',${row.id},true),set_config('joint.aal','aal2',true),set_config('joint.mfa_authenticated_at',${String(context.mfaAuthenticatedAt)},true)`;
    return tx.$queryRaw<
      { allowed: boolean }[]
    >`SELECT app.deletion_authorized() AS allowed`;
  });
  expect(permission?.allowed).toBe(false);
});
