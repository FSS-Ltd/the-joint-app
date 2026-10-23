import { randomBytes, randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import type {
  AuthContext,
  GoalWrite,
} from "../packages/contracts/dist/index.js";
import { createOrm } from "../packages/database/dist/client.js";
import { ScopedDatabase } from "../packages/database/dist/scoped-transaction.js";
import { ArchiveDatabase } from "../packages/database/dist/archive-transaction.js";
import { DeletionRepository } from "../packages/database/dist/deletion.repository.js";
import { GoalService } from "../apps/api/src/modules/goals/goals.service.js";
import { IdentityVault } from "../apps/api/src/modules/identity/identity-vault.js";
import { createFixtureOwner } from "./fixtures/database.js";
it("actual deletion purges post-exit metadata while preserving the remaining adult's exact frozen history", async () => {
  if (!process.env.DATABASE_URL) throw Error("Local runtime database required");
  const owner = createFixtureOwner(),
    runtime = createOrm(process.env.DATABASE_URL),
    scoped = new ScopedDatabase(runtime),
    archive = new ArchiveDatabase(runtime);
  const key = randomBytes(32).toString("base64"),
    goals = new GoalService(scoped, archive, new IdentityVault(key, key)),
    deletion = new DeletionRepository(runtime);
  const hh = randomUUID();
  const actor = (): AuthContext => ({
    userId: randomUUID(),
    membershipId: randomUUID(),
    sessionId: randomUUID(),
    householdId: hh,
    aal: "aal2",
    mfaAuthenticatedAt: Date.now(),
    grantVersion: 0,
    requestId: randomUUID(),
  });
  const a = actor(),
    b = actor();
  const input: GoalWrite = {
    name: "Original shared metadata",
    status: "ACTIVE",
    beneficiary: "ADULT",
    priority: 1,
    target: { amountMinor: "100", currency: "GBP" },
    targetDate: null,
  };
  try {
    await owner.household.create({ data: { id: hh } });
    for (const [i, c] of [a, b].entries())
      await owner.user.create({
        data: {
          id: c.userId,
          memberships: {
            create: { id: c.membershipId, householdId: hh, slot: i + 1 },
          },
          sessions: {
            create: {
              id: c.sessionId,
              householdId: hh,
              expiresAt: new Date(Date.now() + 600000),
            },
          },
        },
      });
    const shared = await goals.create(a, input, randomUUID());
    const originalRevision = await owner.goalRevision.findUniqueOrThrow({
      where: { goalId_version: { goalId: shared.id, version: 1 } },
    });
    await scoped.withScope(
      a,
      (tx) => tx.$queryRaw`SELECT app.leave_household()`,
    );
    await owner.sessionRegistry.update({
      where: { id: b.sessionId },
      data: { revokedAt: null },
    });
    b.grantVersion = (
      await owner.membership.findUniqueOrThrow({
        where: { id: b.membershipId },
      })
    ).grantVersion;
    await goals.write(b, shared.id, 1, {
      ...input,
      name: "Deleted adult post-exit private metadata",
      target: { amountMinor: "999999", currency: "GBP" },
    });
    await expect(
      owner.goal.update({
        where: { id: shared.id },
        data: { name: input.name, targetMinor: 100n, version: 1 },
      }),
    ).rejects.toThrow();
    await expect(
      owner.goalRevision.delete({
        where: { goalId_version: { goalId: shared.id, version: 2 } },
      }),
    ).rejects.toThrow();
    const exclusive = await goals.create(b, input, randomUUID());
    const request = await deletion.request(
      b,
      randomUUID(),
      randomBytes(32).toString("hex"),
      new Date(Date.now() + 600000),
    );
    const lease = await deletion.claim(request.id);
    if (!lease) throw Error("Missing synthetic deletion lease");
    await deletion.purge(lease.id, lease.leaseToken);
    const retained = await owner.goal.findUniqueOrThrow({
      where: { id: shared.id },
      include: { revisions: true, participants: true },
    });
    expect(retained.revisions.map((r) => r.version)).toEqual([1]);
    expect(retained.revisions[0]?.createdAt).toEqual(
      originalRevision.createdAt,
    );
    await expect(
      owner.goalRevision.delete({
        where: { goalId_version: { goalId: shared.id, version: 1 } },
      }),
    ).rejects.toThrow();
    expect(retained.name).toBe(input.name);
    expect(retained.targetMinor).toBe(100n);
    expect(retained.version).toBe(1);
    expect(retained.participants).toHaveLength(1);
    expect(retained.participants[0]?.cutoffVersion).toBe(1);
    expect(JSON.stringify(retained.revisions)).not.toContain(
      "post-exit private",
    );
    expect(
      await owner.goal.findUnique({ where: { id: exclusive.id } }),
    ).toBeNull();
    await owner.sessionRegistry.create({
      data: {
        id: (a.sessionId = randomUUID()),
        userId: a.userId,
        expiresAt: new Date(Date.now() + 600000),
      },
    });
    const frozen = await goals.readArchive(a, shared.id);
    expect(frozen.goal).toEqual(shared);
    expect(frozen.revisions).toHaveLength(1);
    await deletion.purge(lease.id, lease.leaseToken);
    expect((await goals.readArchive(a, shared.id)).goal).toEqual(shared);
    await deletion.finish(lease.id, lease.leaseToken, true);
  } finally {
    await owner.deletionRequest.deleteMany({
      where: { userId: { in: [a.userId, b.userId] } },
    });
    await owner.household.deleteMany({ where: { id: hh } });
    await owner.requestKey.deleteMany({
      where: { userId: { in: [a.userId, b.userId] } },
    });
    await owner.sessionRegistry.deleteMany({
      where: { userId: { in: [a.userId, b.userId] } },
    });
    await owner.auditEvent.deleteMany({
      where: { userId: { in: [a.userId, b.userId] } },
    });
    await owner.user.deleteMany({
      where: { id: { in: [a.userId, b.userId] } },
    });
    await Promise.all([owner.$disconnect(), runtime.$disconnect()]);
  }
});
