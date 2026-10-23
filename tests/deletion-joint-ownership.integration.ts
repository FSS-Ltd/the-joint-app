import { createHash, randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import { createOrm } from "../packages/database/dist/client.js";
import { DeletionRepository } from "../packages/database/dist/deletion.repository.js";
import { ScopedDatabase } from "../packages/database/dist/scoped-transaction.js";
import { LeaveService } from "../apps/api/dist/modules/privacy/leave.service.js";
import { createFixtureOwner } from "./fixtures/database.js";

it.each(["sequential", "pending", "left", "overlap"] as const)(
  "purges joint source records after both owners delete (%s)",
  async (mode) => {
    if (!process.env.DATABASE_URL)
      throw new Error("Runtime database URL required");
    const owner = createFixtureOwner(),
      runtime = createOrm(process.env.DATABASE_URL),
      repository = new DeletionRepository(runtime);
    const householdId = randomUUID(),
      otherHouseholdId = randomUUID(),
      a = randomUUID(),
      b = randomUUID(),
      c = randomUUID();
    const ma = randomUUID(),
      mb = randomUUID(),
      mc = randomUUID(),
      joint = randomUUID(),
      aSole = randomUUID(),
      bSole = randomUUID(),
      cSole = randomUUID();
    const requests: string[] = [],
      users = [a, b, c];
    const hash = createHash("sha256").update(randomUUID()).digest("hex");
    async function request(userId: string) {
      const sessionId = randomUUID(),
        id = randomUUID();
      requests.push(id);
      await owner.sessionRegistry.create({
        data: {
          id: sessionId,
          userId,
          householdId,
          expiresAt: new Date(Date.now() + 600000),
        },
      });
      await repository.request(
        {
          userId,
          sessionId,
          aal: "aal2",
          mfaAuthenticatedAt: Date.now() - 1000,
          requestId: randomUUID(),
        },
        id,
        hash,
        new Date(Date.now() + 86400000),
      );
      const lease = await repository.claim(id);
      if (!lease) throw new Error("Missing owner deletion lease");
      return lease;
    }
    function gate() {
      let resolve: () => void = () => {};
      const promise = new Promise<void>((finish) => {
        resolve = finish;
      });
      return { promise, resolve };
    }
    try {
      await owner.user.createMany({ data: users.map((id) => ({ id })) });
      await owner.household.create({
        data: {
          id: householdId,
          memberships: {
            create: [
              { id: ma, userId: a, slot: 1, role: "ADMIN" },
              { id: mb, userId: b, slot: 2 },
            ],
          },
        },
      });
      await owner.household.create({
        data: {
          id: otherHouseholdId,
          memberships: {
            create: { id: mc, userId: c, slot: 1, role: "ADMIN" },
          },
        },
      });
      for (const [id, userId, membershipId, household] of [
        [aSole, a, ma, householdId],
        [bSole, b, mb, householdId],
        [cSole, c, mc, otherHouseholdId],
        [joint, a, ma, householdId],
      ] as const) {
        await owner.account.create({
          data: {
            id,
            householdId: household,
            creatorUserId: userId,
            creatorMembershipId: membershipId,
            kind: "CURRENT",
            label: "Synthetic ownership source",
            legalOwnerKind: id === joint ? "JOINT_ADULT" : "ADULT",
            owners: { create: { userId, membershipId } },
          },
        });
      }
      await owner.accountOwner.create({
        data: { accountId: joint, householdId, userId: b, membershipId: mb },
      });
      const transaction = await owner.transaction.create({
        data: {
          householdId,
          accountId: joint,
          sourceNamespace: "MANUAL",
          sourceId: randomUUID(),
          sourceHash: "a".repeat(64),
          fingerprint: "b".repeat(64),
          amountMinor: -100n,
          bookedDate: new Date("2026-10-01"),
          description: "Joint history",
        },
      });
      if (mode === "left") {
        const sessionId = randomUUID();
        await owner.sessionRegistry.create({
          data: {
            id: sessionId,
            userId: b,
            householdId,
            expiresAt: new Date(Date.now() + 600000),
          },
        });
        await new LeaveService(new ScopedDatabase(runtime)).leave({
          userId: b,
          membershipId: mb,
          householdId,
          sessionId,
          grantVersion: 0,
          aal: "aal2",
          mfaAuthenticatedAt: Date.now() - 1000,
          requestId: randomUUID(),
        });
      }
      const first = await request(a);
      if (mode !== "overlap") {
        const pendingSecond = mode === "pending" ? await request(b) : null;
        await repository.purge(first.id, first.leaseToken);
        expect(
          await owner.account.findUnique({ where: { id: aSole } }),
        ).toBeNull();
        expect(
          await owner.account.count({
            where: { id: { in: [joint, bSole, cSole] } },
          }),
        ).toBe(3);
        expect(
          await owner.transaction.findUnique({ where: { id: transaction.id } }),
        ).not.toBeNull();
        expect(await owner.user.findUnique({ where: { id: b } })).toMatchObject(
          { status: mode === "pending" ? "DISABLED" : "ACTIVE" },
        );
        if (mode === "left")
          expect(
            await owner.membership.findUnique({ where: { id: mb } }),
          ).toMatchObject({ status: "LEFT" });
        const second = pendingSecond ?? (await request(b));
        await repository.purge(second.id, second.leaseToken);
        await repository.finish(first.id, first.leaseToken, true);
        await repository.finish(second.id, second.leaseToken, true);
      } else {
        const second = await request(b),
          firstReady = gate(),
          secondReady = gate(),
          release = gate();
        let firstPid = 0,
          secondPid = 0;
        const purgeFirst = runtime.$transaction(
          async (tx) => {
            const [pid] = await tx.$queryRaw<
              { pid: number }[]
            >`SELECT pg_backend_pid() AS pid`;
            if (!pid) throw new Error("Missing first backend");
            firstPid = pid.pid;
            await tx.$executeRaw`SELECT app.purge_deletion_request(${first.id}::uuid,${first.leaseToken}::uuid)`;
            firstReady.resolve();
            await release.promise;
          },
          { timeout: 5000 },
        );
        await Promise.race([firstReady.promise, purgeFirst]);
        const purgeSecond = runtime.$transaction(
          async (tx) => {
            const [pid] = await tx.$queryRaw<
              { pid: number }[]
            >`SELECT pg_backend_pid() AS pid`;
            if (!pid) throw new Error("Missing second backend");
            secondPid = pid.pid;
            secondReady.resolve();
            await tx.$executeRaw`SELECT app.purge_deletion_request(${second.id}::uuid,${second.leaseToken}::uuid)`;
          },
          { timeout: 5000 },
        );
        await Promise.race([secondReady.promise, purgeSecond]);
        try {
          let blocked = false;
          for (let n = 0; n < 100; n++) {
            const [row] = await owner.$queryRaw<
              { blocked: boolean }[]
            >`SELECT ${firstPid}::int=ANY(pg_blocking_pids(${secondPid}::int)) AS blocked`;
            if (row?.blocked) {
              blocked = true;
              break;
            }
            await new Promise<void>((resolve) => setTimeout(resolve, 10));
          }
          expect(blocked).toBe(true);
        } finally {
          release.resolve();
        }
        await Promise.all([purgeFirst, purgeSecond]);
        await repository.finish(first.id, first.leaseToken, true);
        await repository.finish(second.id, second.leaseToken, true);
      }
      expect(
        await owner.account.findUnique({ where: { id: joint } }),
      ).toBeNull();
      expect(
        await owner.transaction.findUnique({ where: { id: transaction.id } }),
      ).toBeNull();
      expect(
        await owner.account.count({ where: { id: { in: [aSole, bSole] } } }),
      ).toBe(0);
      expect(
        await owner.account.findUnique({ where: { id: cSole } }),
      ).not.toBeNull();
      expect(
        await owner.user.count({
          where: { id: { in: [a, b] }, status: "DELETED" },
        }),
      ).toBe(2);
    } finally {
      await owner.account.deleteMany({
        where: { householdId: { in: [householdId, otherHouseholdId] } },
      });
      await owner.household.deleteMany({
        where: { id: { in: [householdId, otherHouseholdId] } },
      });
      await owner.sessionRegistry.deleteMany({
        where: { userId: { in: users } },
      });
      await owner.auditEvent.deleteMany({ where: { userId: { in: users } } });
      await owner.$executeRaw`DELETE FROM app."DeletionRequest" WHERE id=ANY(${requests}::uuid[])`;
      await owner.user.deleteMany({ where: { id: { in: users } } });
      await Promise.all([owner.$disconnect(), runtime.$disconnect()]);
    }
  },
);
