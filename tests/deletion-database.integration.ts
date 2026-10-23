import { createHash, randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import { createOrm } from "../packages/database/dist/client.js";
import { DeletionRepository } from "../packages/database/dist/deletion.repository.js";
import type { OwnerArchiveContext } from "../packages/database/dist/archive-transaction.js";

it("requires verified deletion, fences leases, preserves other owners and keeps provider failures pending", async () => {
  if (!process.env.DATABASE_URL || !process.env.MIGRATION_DATABASE_URL)
    throw new Error("Database URLs required");
  const runtime = createOrm(process.env.DATABASE_URL),
    owner = createOrm(process.env.MIGRATION_DATABASE_URL);
  const repository = new DeletionRepository(runtime);
  const userId = randomUUID(),
    partnerId = randomUUID(),
    soloId = randomUUID(),
    householdId = randomUUID();
  const memberId = randomUUID(),
    partnerMemberId = randomUUID(),
    sessionId = randomUUID(),
    soloSession = randomUUID();
  const ownId = randomUUID(),
    jointId = randomUUID(),
    partnerAccountId = randomUUID(),
    requestId = randomUUID();
  const receiptHash = createHash("sha256").update(randomUUID()).digest("hex");
  const context: OwnerArchiveContext = {
    userId,
    sessionId,
    aal: "aal2",
    mfaAuthenticatedAt: Date.now(),
    requestId: randomUUID(),
  };
  const expiry = new Date(Date.now() + 29 * 86400000);
  const emailHash = createHash("sha256").update(userId).digest("hex");
  const invitationId = randomUUID();
  try {
    await owner.user.createMany({
      data: [userId, partnerId, soloId].map((id) => ({
        id,
        emailHash: id === userId ? emailHash : null,
      })),
    });
    await owner.household.create({
      data: {
        id: householdId,
        memberships: {
          create: [
            { id: memberId, userId, role: "ADMIN", slot: 1 },
            { id: partnerMemberId, userId: partnerId, slot: 2 },
          ],
        },
      },
    });
    await owner.invitation.create({
      data: {
        id: invitationId,
        householdId,
        issuedByUserId: partnerId,
        emailHash,
        tokenHash: createHash("sha256").update(invitationId).digest("hex"),
        expiresAt: expiry,
      },
    });
    await owner.sessionRegistry.createMany({
      data: [
        {
          id: sessionId,
          userId,
          householdId,
          kind: "WEB" as const,
          browserTokenHash: createHash("sha256")
            .update(sessionId)
            .digest("hex"),
          providerExpiresAt: new Date(Date.now() + 600000),
          providerTokens: "synthetic-provider-secret",
        },
        { id: soloSession, userId: soloId },
      ].map((session) => ({
        ...session,
        expiresAt: new Date(Date.now() + 600000),
      })),
    });
    for (const [id, creatorUserId, creatorMembershipId, legalOwnerKind] of [
      [ownId, userId, memberId, "ADULT"],
      [jointId, userId, memberId, "JOINT_ADULT"],
      [partnerAccountId, partnerId, partnerMemberId, "ADULT"],
    ] as const) {
      await owner.account.create({
        data: {
          id,
          householdId,
          creatorUserId,
          creatorMembershipId,
          kind: "CURRENT",
          label: "Synthetic deletion source",
          legalOwnerKind,
          owners: {
            create: {
              userId: creatorUserId,
              membershipId: creatorMembershipId,
            },
          },
        },
      });
    }
    await owner.accountOwner.create({
      data: {
        accountId: jointId,
        householdId,
        userId: partnerId,
        membershipId: partnerMemberId,
      },
    });
    await owner.accountGrant.createMany({
      data: [
        { accountId: ownId, membershipId: partnerMemberId },
        { accountId: partnerAccountId, membershipId: memberId },
      ].map((value) => ({ ...value, householdId, level: "TRANSACTIONS" })),
    });
    const transaction = await owner.transaction.create({
      data: {
        householdId,
        accountId: jointId,
        sourceNamespace: "MANUAL",
        sourceId: randomUUID(),
        sourceHash: "a".repeat(64),
        fingerprint: "b".repeat(64),
        amountMinor: -100n,
        bookedDate: new Date("2026-10-01"),
        description: "Joint source retained",
      },
    });
    await owner.transactionNote.createMany({
      data: [
        {
          authorUserId: userId,
          authorMembershipId: memberId,
          body: "Delete my private note",
        },
        {
          authorUserId: partnerId,
          authorMembershipId: partnerMemberId,
          body: "Retain partner private note",
        },
      ].map((note) => ({
        ...note,
        householdId,
        accountId: jointId,
        transactionId: transaction.id,
      })),
    });
    const scope = await owner.budgetScope.create({
      data: {
        householdId,
        scopeHash: "c".repeat(64),
        creatorMembershipId: memberId,
        accounts: {
          create: [ownId, partnerAccountId].map((accountId) => ({ accountId })),
        },
      },
    });
    await owner.budgetScope.update({
      where: { id: scope.id },
      data: { ready: true },
    });
    await owner.budget.create({
      data: {
        householdId,
        scopeId: scope.id,
        month: new Date("2026-10-01"),
        creatorMembershipId: memberId,
        lines: {
          create: { category: "Food", amountMinor: 5000n },
        },
      },
    });
    for (const overrides of [
      { aal: "aal1" as const },
      { mfaAuthenticatedAt: null },
      { mfaAuthenticatedAt: Date.now() - 301000 },
      { mfaAuthenticatedAt: Date.now() + 60000 },
      { sessionId: soloSession },
    ]) {
      await expect(
        repository.authorize({ ...context, ...overrides }),
      ).rejects.toBeDefined();
      await expect(
        repository.request(
          { ...context, ...overrides },
          requestId,
          receiptHash,
          expiry,
        ),
      ).rejects.toBeDefined();
    }
    expect(
      await owner.user.findUnique({ where: { id: userId } }),
    ).toMatchObject({ status: "ACTIVE" });
    await expect(repository.authorize(context)).resolves.toBeUndefined();
    await expect(
      new DeletionRepository(owner).authorize(context),
    ).rejects.toThrow("restricted runtime database role");
    await expect(
      runtime.$queryRaw`SELECT * FROM app."DeletionRequest"`,
    ).rejects.toBeDefined();
    await expect(
      runtime.$executeRaw`SELECT app.exit_household_member(${userId}::uuid,${householdId}::uuid,${memberId}::uuid)`,
    ).rejects.toBeDefined();
    const status = await repository.request(
      context,
      requestId,
      receiptHash,
      expiry,
    );
    expect(status).toMatchObject({
      id: requestId,
      state: "PENDING",
      completedAt: null,
    });
    expect(
      await repository.request(context, requestId, receiptHash, expiry),
    ).toEqual(status);
    await expect(
      repository.request(
        { ...context, userId: partnerId },
        requestId,
        receiptHash,
        expiry,
      ),
    ).rejects.toBeDefined();
    expect(
      await owner.user.findUnique({ where: { id: userId } }),
    ).toMatchObject({ status: "DISABLED" });
    expect(
      await owner.membership.findUnique({ where: { id: memberId } }),
    ).toMatchObject({ status: "LEFT", slot: null });
    expect(
      await owner.sessionRegistry.findUnique({ where: { id: sessionId } }),
    ).toMatchObject({ providerTokens: null, revokedAt: expect.any(Date) });
    expect(
      await owner.accountGrant.count({
        where: { householdId, level: { not: "NONE" } },
      }),
    ).toBe(0);
    expect(await repository.status(requestId, "0".repeat(64))).toBeNull();
    expect(await repository.status(randomUUID(), receiptHash)).toBeNull();
    expect(await repository.status(requestId, receiptHash)).toMatchObject({
      state: "PENDING",
    });
    await expect(
      runtime.account.deleteMany({ where: { id: ownId } }),
    ).rejects.toBeDefined();
    await expect(
      runtime.user.deleteMany({ where: { id: userId } }),
    ).rejects.toBeDefined();
    const lease = await repository.claim(requestId);
    expect(lease).toMatchObject({ id: requestId, userId });
    if (!lease) throw new Error("Missing deletion lease");
    expect(await repository.claim(requestId)).toBeNull();
    await expect(
      repository.purge(requestId, randomUUID()),
    ).rejects.toBeDefined();
    await expect(
      repository.purge(randomUUID(), lease.leaseToken),
    ).rejects.toBeDefined();
    await expect(
      repository.finish(requestId, lease.leaseToken, true),
    ).rejects.toBeDefined();
    await repository.purge(requestId, lease.leaseToken);
    expect(await owner.account.findUnique({ where: { id: ownId } })).toBeNull();
    expect(
      await owner.account.count({
        where: { id: { in: [jointId, partnerAccountId] } },
      }),
    ).toBe(2);
    expect(
      await owner.budgetScope.findUnique({ where: { id: scope.id } }),
    ).toBeNull();
    expect(await owner.budget.count({ where: { scopeId: scope.id } })).toBe(0);
    expect(
      await owner.transactionNote.findMany({
        where: { transactionId: transaction.id },
      }),
    ).toMatchObject([
      { authorUserId: partnerId, body: "Retain partner private note" },
    ]);
    expect(
      await owner.user.findUnique({ where: { id: userId } }),
    ).toMatchObject({ status: "DELETED", emailHash: null });
    expect(
      await owner.invitation.findUnique({ where: { id: invitationId } }),
    ).toBeNull();
    const [privateEpochs] = await owner.$queryRaw<
      { count: number }[]
    >`SELECT count(*)::int AS count FROM app."ExportNoteRevision" WHERE "userId"=${userId}::uuid`;
    expect(privateEpochs?.count).toBe(0);
    expect(await repository.status(requestId, receiptHash)).toMatchObject({
      state: "PROVIDER_PENDING",
      completedAt: null,
    });
    await repository.finish(requestId, lease.leaseToken, false);
    expect(await repository.status(requestId, receiptHash)).toMatchObject({
      state: "PROVIDER_PENDING",
      completedAt: null,
    });
    await expect(
      repository.purge(requestId, lease.leaseToken),
    ).rejects.toBeDefined();
    expect(await repository.claim(requestId)).toBeNull();
    const [scheduledRetry] = await owner.$queryRaw<
      { scheduled: boolean }[]
    >`SELECT "runAfter">clock_timestamp() AS scheduled FROM app."DeletionRequest" WHERE id=${requestId}::uuid`;
    expect(scheduledRetry?.scheduled).toBe(true);
    await owner.$executeRaw`UPDATE app."DeletionRequest" SET "runAfter"=clock_timestamp()-interval '1 second' WHERE id=${requestId}::uuid`;
    const retry = await repository.claim(requestId);
    if (!retry) throw new Error("Missing retry lease");
    expect(retry.leaseToken).not.toBe(lease.leaseToken);
    await repository.finish(requestId, retry.leaseToken, true);
    expect(await repository.status(requestId, receiptHash)).toMatchObject({
      state: "COMPLETED",
      completedAt: expect.any(String),
    });
    expect(await repository.claim(requestId)).toBeNull();
    const soloRequest = randomUUID();
    await repository.request(
      { ...context, userId: soloId, sessionId: soloSession },
      soloRequest,
      receiptHash,
      expiry,
    );
    const soloLease = await repository.claim(soloRequest);
    if (!soloLease) throw new Error("Missing household-free lease");
    await owner.$executeRaw`UPDATE app."DeletionRequest" SET "leaseUntil"=clock_timestamp()-interval '1 second' WHERE id=${soloRequest}::uuid`;
    await expect(
      repository.purge(soloRequest, soloLease.leaseToken),
    ).rejects.toBeDefined();
    expect(await repository.claim(soloRequest)).toBeNull();
    await owner.$executeRaw`UPDATE app."DeletionRequest" SET "runAfter"=clock_timestamp()-interval '1 second' WHERE id=${soloRequest}::uuid`;
    const renewed = await repository.claim(soloRequest);
    if (!renewed) throw new Error("Missing renewed lease");
    await repository.purge(soloRequest, renewed.leaseToken);
    await repository.finish(soloRequest, renewed.leaseToken, true);
    expect(await repository.status(soloRequest, receiptHash)).toMatchObject({
      state: "COMPLETED",
    });
    await owner.$executeRaw`UPDATE app."DeletionRequest" SET "statusExpiresAt"=clock_timestamp()-interval '1 second' WHERE id=${soloRequest}::uuid`;
    expect(await repository.status(soloRequest, receiptHash)).toBeNull();
    await expect(
      repository.request(
        { ...context, userId: soloId, sessionId: soloSession },
        soloRequest,
        receiptHash,
        expiry,
      ),
    ).rejects.toBeDefined();
  } finally {
    await owner.budgetScope.deleteMany({ where: { householdId } });
    await owner.account.deleteMany({ where: { householdId } });
    await owner.household.deleteMany({ where: { id: householdId } });
    await owner.sessionRegistry.deleteMany({
      where: { userId: { in: [userId, partnerId, soloId] } },
    });
    await owner.auditEvent.deleteMany({
      where: { userId: { in: [userId, partnerId, soloId] } },
    });
    await owner.$executeRaw`DELETE FROM app."DeletionRequest" WHERE "userId"=ANY(${[userId, partnerId, soloId]}::uuid[])`;
    await owner.user.deleteMany({
      where: { id: { in: [userId, partnerId, soloId] } },
    });
    await Promise.all([owner.$disconnect(), runtime.$disconnect()]);
  }
});
