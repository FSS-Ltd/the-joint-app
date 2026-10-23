import { randomBytes, randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import type { AuthContext } from "../packages/contracts/dist/index.js";
import { createOrm } from "../packages/database/dist/client.js";
import { ScopedDatabase } from "../packages/database/dist/scoped-transaction.js";
import { ArchiveDatabase } from "../packages/database/dist/archive-transaction.js";
import { ArchiveService } from "../apps/api/dist/modules/archive/archive.service.js";
import { LeaveService } from "../apps/api/dist/modules/privacy/leave.service.js";
import { IdentityVault } from "../apps/api/dist/modules/identity/identity-vault.js";

it("leaves atomically and isolates read-only recorded-owner archives from grants and partner notes", async () => {
  if (!process.env.DATABASE_URL || !process.env.MIGRATION_DATABASE_URL)
    throw new Error("Runtime and migration URLs are required");
  const runtime = createOrm(process.env.DATABASE_URL);
  const owner = createOrm(process.env.MIGRATION_DATABASE_URL);
  const userId = randomUUID(),
    partnerId = randomUUID(),
    outsiderId = randomUUID();
  const householdId = randomUUID(),
    otherHouseholdId = randomUUID(),
    nextHouseholdId = randomUUID();
  const membershipId = randomUUID(),
    partnerMembershipId = randomUUID();
  const sessionId = randomUUID(),
    partnerSessionId = randomUUID(),
    freshSessionId = randomUUID();
  const accountId = randomUUID(),
    partnerAccountId = randomUUID(),
    jointId = randomUUID();
  const txId = randomUUID();
  const context: AuthContext = {
    userId,
    membershipId,
    householdId,
    sessionId,
    grantVersion: 0,
    aal: "aal2",
    mfaAuthenticatedAt: Date.now(),
    requestId: randomUUID(),
  };
  const archiveContext = {
    userId,
    sessionId: freshSessionId,
    aal: "aal2" as const,
    mfaAuthenticatedAt: Date.now(),
    requestId: randomUUID(),
  };
  const scoped = new ScopedDatabase(runtime);
  const archiveDb = new ArchiveDatabase(runtime);
  const key = randomBytes(32).toString("base64");
  const archive = new ArchiveService(archiveDb, new IdentityVault(key, key));
  try {
    await owner.user.createMany({
      data: [userId, partnerId, outsiderId].map((id) => ({ id })),
    });
    await owner.household.create({
      data: {
        id: householdId,
        memberships: {
          create: [
            { id: membershipId, userId, role: "ADMIN", slot: 1 },
            {
              id: partnerMembershipId,
              userId: partnerId,
              role: "MEMBER",
              slot: 2,
            },
          ],
        },
      },
    });
    await owner.household.create({
      data: {
        id: otherHouseholdId,
        memberships: { create: { userId: outsiderId, role: "ADMIN", slot: 1 } },
      },
    });
    await owner.sessionRegistry.createMany({
      data: [
        { id: sessionId, userId },
        { id: partnerSessionId, userId: partnerId },
      ].map((session) => ({
        ...session,
        householdId,
        expiresAt: new Date(Date.now() + 600000),
      })),
    });
    for (const [id, creatorUserId, creatorMembershipId, legalOwnerKind] of [
      [accountId, userId, membershipId, "ADULT"],
      [partnerAccountId, partnerId, partnerMembershipId, "ADULT"],
      [jointId, userId, membershipId, "JOINT_ADULT"],
    ] as const) {
      await owner.account.create({
        data: {
          id,
          householdId,
          creatorUserId,
          creatorMembershipId,
          kind: "CURRENT",
          label: "Synthetic retained source",
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
        membershipId: partnerMembershipId,
      },
    });
    await owner.accountGrant.createMany({
      data: [
        { accountId, membershipId: partnerMembershipId },
        { accountId: partnerAccountId, membershipId },
      ].map((grant) => ({ ...grant, householdId, level: "TRANSACTIONS" })),
    });
    await owner.balanceSnapshot.create({
      data: {
        householdId,
        accountId,
        amountMinor: 123456n,
        asOfDate: new Date("2026-10-01"),
        authorMembershipId: membershipId,
      },
    });
    for (let index = 0; index < 3; index++)
      await owner.transaction.create({
        data: {
          id: index === 0 ? txId : randomUUID(),
          householdId,
          accountId,
          sourceNamespace: "MANUAL",
          sourceId: randomUUID(),
          sourceHash: "a".repeat(64),
          fingerprint: "b".repeat(64),
          amountMinor: -1250n,
          bookedDate: new Date("2026-10-01"),
          description: "Synthetic transaction",
        },
      });
    await owner.transactionNote.createMany({
      data: [
        {
          authorUserId: userId,
          authorMembershipId: membershipId,
          body: "Owner private note",
        },
        {
          authorUserId: partnerId,
          authorMembershipId: partnerMembershipId,
          body: "Partner secret note",
        },
      ].map((note) => ({
        ...note,
        householdId,
        accountId,
        transactionId: txId,
      })),
    });
    const unpublishedBatch = await owner.importBatch.create({
      data: {
        householdId,
        accountId,
        requestedByUserId: userId,
        requestedByMembershipId: membershipId,
        fileChecksum: "c".repeat(64),
        mappingHash: "d".repeat(64),
        mapping: {},
        parserVersion: "test",
        previewExpiresAt: new Date(Date.now() + 600000),
      },
    });
    await owner.transaction.create({
      data: {
        householdId,
        accountId,
        sourceNamespace: "CSV",
        sourceId: randomUUID(),
        sourceHash: "e".repeat(64),
        fingerprint: "f".repeat(64),
        amountMinor: -100n,
        bookedDate: new Date("2026-10-01"),
        description: "Unpublished private preview",
        originImportBatchId: unpublishedBatch.id,
        csvRowNumber: 2,
      },
    });
    await expect(
      archive.list({ ...archiveContext, sessionId }, 10),
    ).resolves.toMatchObject({ items: [] });
    const result = await new LeaveService(scoped).leave(context);
    expect(result).toMatchObject({ left: true, householdId, membershipId });
    expect(new Set(result.affectedAccountIds)).toEqual(
      new Set([accountId, jointId]),
    );
    expect(
      await owner.membership.findUnique({ where: { id: membershipId } }),
    ).toMatchObject({ status: "LEFT", slot: null, grantVersion: 1 });
    expect(
      await owner.membership.findUnique({ where: { id: partnerMembershipId } }),
    ).toMatchObject({ role: "ADMIN", grantVersion: 1 });
    expect(
      await owner.accountGrant.count({
        where: { householdId, level: { not: "NONE" } },
      }),
    ).toBe(0);
    expect(
      await owner.sessionRegistry.count({
        where: { householdId, revokedAt: null },
      }),
    ).toBe(0);
    await expect(
      archive.list({ ...archiveContext, sessionId }, 10),
    ).rejects.toBeDefined();
    await expect(
      scoped.withScope(context, (tx) => tx.account.findMany()),
    ).rejects.toBeDefined();
    await owner.sessionRegistry.create({
      data: {
        id: freshSessionId,
        userId,
        expiresAt: new Date(Date.now() + 600000),
      },
    });
    await expect(
      archive.list({ ...archiveContext, userId: outsiderId }, 10),
    ).rejects.toBeDefined();
    await expect(
      archive.list({ ...archiveContext, sessionId: randomUUID() }, 10),
    ).rejects.toBeDefined();
    await expect(archive.list(archiveContext, 0)).rejects.toMatchObject({
      status: 400,
    });
    await expect(archive.list(archiveContext, 201)).rejects.toMatchObject({
      status: 400,
    });
    await expect(
      new ArchiveDatabase(owner).withScope(archiveContext, (tx) =>
        tx.account.findMany(),
      ),
    ).rejects.toThrow("restricted runtime database role");
    const first = await archive.list(archiveContext, 1);
    expect(first.items).toHaveLength(1);
    expect(first.nextCursor).not.toBeNull();
    const second = await archive.list(
      archiveContext,
      1,
      first.nextCursor ?? undefined,
    );
    expect(
      new Set([...first.items, ...second.items].map((row) => row.id)),
    ).toEqual(new Set([accountId, jointId]));
    await expect(
      archive.list(archiveContext, 1, "forged-cursor"),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      archive.transactions(
        archiveContext,
        accountId,
        1,
        first.nextCursor ?? undefined,
      ),
    ).rejects.toMatchObject({ status: 400 });
    const retained = await archive.read(archiveContext, accountId);
    expect(retained).toMatchObject({
      version: 1,
      latestValuation: { money: { amountMinor: "123456" } },
      sharing: null,
      permissions: { canEdit: false, canValue: false, canShare: false },
    });
    await expect(
      archive.read(archiveContext, partnerAccountId),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      archive.read(archiveContext, randomUUID()),
    ).rejects.toMatchObject({ status: 404 });
    const page = await archive.transactions(archiveContext, accountId, 2);
    expect(page.items).toHaveLength(2);
    const rest = await archive.transactions(
      archiveContext,
      accountId,
      2,
      page.nextCursor ?? undefined,
    );
    const rows = [...page.items, ...rest.items];
    expect(rows).toHaveLength(3);
    expect(rows.find((row) => row.id === txId)?.note.body).toBe(
      "Owner private note",
    );
    expect(JSON.stringify(rows)).not.toContain("Partner secret note");
    expect(
      rows.every(
        (row) =>
          !row.permissions.canCorrect &&
          !row.permissions.canClassify &&
          !row.permissions.canNote,
      ),
    ).toBe(true);
    await expect(
      archive.transactions(archiveContext, partnerAccountId, 10),
    ).rejects.toMatchObject({ status: 404 });
    expect(
      await archiveDb.withScope(archiveContext, (tx) =>
        tx.account.updateMany({
          where: { id: accountId },
          data: { label: "Forbidden" },
        }),
      ),
    ).toMatchObject({ count: 0 });
    expect(
      await archiveDb.withScope(archiveContext, (tx) =>
        tx.accountGrant.findMany(),
      ),
    ).toEqual([]);
    expect(
      await archiveDb.withScope(archiveContext, (tx) =>
        tx.transactionNote.findMany(),
      ),
    ).toHaveLength(1);
    const partnerFresh = randomUUID();
    await owner.sessionRegistry.create({
      data: {
        id: partnerFresh,
        userId: partnerId,
        householdId,
        expiresAt: new Date(Date.now() + 600000),
      },
    });
    const partnerContext = {
      ...context,
      userId: partnerId,
      membershipId: partnerMembershipId,
      sessionId: partnerFresh,
      grantVersion: 1,
    };
    expect(
      await scoped.withScope(partnerContext, (tx) =>
        tx.account.findMany({ where: { id: jointId } }),
      ),
    ).toHaveLength(1);
    expect(
      await scoped.withScope(partnerContext, (tx) =>
        tx.account.findMany({ where: { id: accountId } }),
      ),
    ).toEqual([]);
    expect(
      (
        await archive.list(
          { ...archiveContext, userId: partnerId, sessionId: partnerFresh },
          10,
        )
      ).items,
    ).toEqual([]);
    await expect(
      owner.membership.update({
        where: { id: membershipId },
        data: { status: "ACTIVE", slot: 1 },
      }),
    ).rejects.toBeDefined();
    await owner.household.create({
      data: {
        id: nextHouseholdId,
        memberships: { create: { userId, role: "ADMIN", slot: 1 } },
      },
    });
    await owner.sessionRegistry.update({
      where: { id: freshSessionId },
      data: { householdId: nextHouseholdId },
    });
    expect((await archive.list(archiveContext, 10)).items).toHaveLength(2);
    await owner.sessionRegistry.update({
      where: { id: freshSessionId },
      data: { purpose: "RECOVERY" },
    });
    await expect(archive.list(archiveContext, 10)).rejects.toBeDefined();
    await owner.sessionRegistry.update({
      where: { id: freshSessionId },
      data: { purpose: "NORMAL", expiresAt: new Date(Date.now() - 1000) },
    });
    await expect(archive.list(archiveContext, 10)).rejects.toBeDefined();
    await owner.sessionRegistry.update({
      where: { id: freshSessionId },
      data: { expiresAt: new Date(Date.now() + 600000) },
    });
    await owner.user.update({
      where: { id: userId },
      data: { status: "DISABLED" },
    });
    await expect(archive.list(archiveContext, 10)).rejects.toBeDefined();
    const sourceFreeMember = await owner.membership.findFirstOrThrow({
      where: { userId: outsiderId },
    });
    const sourceFreeSession = randomUUID();
    await owner.sessionRegistry.create({
      data: {
        id: sourceFreeSession,
        userId: outsiderId,
        householdId: otherHouseholdId,
        expiresAt: new Date(Date.now() + 600000),
      },
    });
    await new LeaveService(scoped).leave({
      ...context,
      userId: outsiderId,
      membershipId: sourceFreeMember.id,
      householdId: otherHouseholdId,
      sessionId: sourceFreeSession,
    });
    await expect(
      owner.membership.update({
        where: { id: sourceFreeMember.id },
        data: { status: "ACTIVE", slot: 1 },
      }),
    ).rejects.toBeDefined();
  } finally {
    await owner.account.deleteMany({ where: { householdId } });
    await owner.household.deleteMany({
      where: { id: { in: [householdId, otherHouseholdId, nextHouseholdId] } },
    });
    await owner.sessionRegistry.deleteMany({
      where: { userId: { in: [userId, partnerId, outsiderId] } },
    });
    await owner.auditEvent.deleteMany({
      where: { userId: { in: [userId, partnerId, outsiderId] } },
    });
    await owner.user.deleteMany({
      where: { id: { in: [userId, partnerId, outsiderId] } },
    });
    await Promise.all([owner.$disconnect(), runtime.$disconnect()]);
  }
});
