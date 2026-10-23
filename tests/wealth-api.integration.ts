import { randomBytes, randomUUID } from "node:crypto";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import type { AuthContext } from "../packages/contracts/dist/index.js";
import { createOrm } from "../packages/database/dist/client.js";
import { ScopedDatabase } from "../packages/database/dist/scoped-transaction.js";
import { createFixtureOwner } from "./fixtures/database.js";
import { WealthService } from "../apps/api/src/modules/wealth/wealth.service.js";
import * as repository from "../apps/api/src/modules/wealth/wealth.repository.js";
import { AccountMutations } from "../apps/api/src/modules/accounts/account-mutations.js";
import { IdentityVault } from "../apps/api/src/modules/identity/identity-vault.js";

const owner = createFixtureOwner();
if (!process.env.DATABASE_URL) throw Error("Local runtime database required");
const runtime = createOrm(process.env.DATABASE_URL),
  scoped = new ScopedDatabase(runtime),
  service = new WealthService(scoped);
const householdId = randomUUID();
const actor: AuthContext = {
  userId: randomUUID(),
  membershipId: randomUUID(),
  sessionId: randomUUID(),
  householdId,
  grantVersion: 0,
  aal: "aal2",
  mfaAuthenticatedAt: Date.now(),
  requestId: randomUUID(),
};
const viewer: AuthContext = {
  ...actor,
  userId: randomUUID(),
  membershipId: randomUUID(),
  sessionId: randomUUID(),
};
const key = randomBytes(32).toString("base64"),
  mutations = new AccountMutations(scoped, new IdentityVault(key, key));
let visible = "",
  hidden = "";
async function fresh(context: AuthContext): Promise<AuthContext> {
  return {
    ...context,
    grantVersion: (
      await owner.membership.findUniqueOrThrow({
        where: { id: context.membershipId },
      })
    ).grantVersion,
  };
}
async function create(context = actor) {
  return mutations.create(
    await fresh(context),
    {
      kind: "SAVINGS",
      label: "Synthetic wealth",
      currency: "GBP",
      liquidity: "AVAILABLE",
    },
    randomUUID(),
  );
}
beforeAll(async () => {
  await owner.household.create({ data: { id: householdId } });
  for (const [i, c] of [actor, viewer].entries())
    await owner.user.create({
      data: {
        id: c.userId,
        memberships: {
          create: { id: c.membershipId, householdId, slot: i + 1 },
        },
        sessions: {
          create: {
            id: c.sessionId,
            householdId,
            expiresAt: new Date(Date.now() + 600000),
          },
        },
      },
    });
  const a = await create();
  visible = a.id;
  hidden = (await create(viewer)).id;
  await mutations.value(
    actor,
    a.id,
    {
      money: { amountMinor: "1000000", currency: "GBP" },
      adultMoney: { amountMinor: "700000", currency: "GBP" },
      asOfDate: new Date().toISOString().slice(0, 10),
    },
    a.version,
    randomUUID(),
  );
});
afterAll(async () => {
  await owner.account.deleteMany({ where: { householdId } });
  await owner.requestKey.deleteMany({
    where: { userId: { in: [actor.userId, viewer.userId] } },
  });
  await owner.sessionRegistry.deleteMany({
    where: { userId: { in: [actor.userId, viewer.userId] } },
  });
  await owner.household.delete({ where: { id: householdId } });
  await owner.user.deleteMany({
    where: { id: { in: [actor.userId, viewer.userId] } },
  });
  await Promise.all([runtime.$disconnect(), owner.$disconnect()]);
});
it("reads only bounded visible valuations through restricted RLS", async () => {
  const result = await service.read(await fresh(actor));
  expect(result.scope.accountIds).toEqual([visible]);
  expect(result.adultNetWorth).toEqual({
    amountMinor: "700000",
    currency: "GBP",
  });
  expect(JSON.stringify(result)).not.toMatch(
    /Synthetic wealth|Transaction|description|connection/i,
  );
  await expect(
    service.read(await fresh(actor), [visible, hidden]),
  ).rejects.toMatchObject({ status: 404 });
  await expect(
    service.read(await fresh(actor), [randomUUID()]),
  ).rejects.toMatchObject({ status: 404 });
  await expect(
    service.read(await fresh(actor), [visible, visible]),
  ).rejects.toMatchObject({ status: 400 });
  await expect(service.read(await fresh(actor), [])).rejects.toMatchObject({
    status: 400,
  });
  await expect(
    service.read(await fresh(actor), ["invalid"]),
  ).rejects.toMatchObject({ status: 400 });
});
it("allows TOTALS without transactions and requires explicit scope above fifty accounts", async () => {
  await owner.accountGrant.create({
    data: {
      householdId,
      accountId: visible,
      membershipId: viewer.membershipId,
      level: "TOTALS",
    },
  });
  expect(
    (await service.read(await fresh(viewer), [visible])).adultNetWorth
      ?.amountMinor,
  ).toBe("700000");
  const made: string[] = [];
  try {
    for (let i = 0; i < 50; i++) made.push((await create()).id);
    await expect(service.read(await fresh(actor))).rejects.toMatchObject({
      status: 400,
      response: { error: { code: "SCOPE_REQUIRED" } },
    });
    expect(
      (await service.read(await fresh(actor), [visible])).scope.accountIds,
    ).toEqual([visible]);
    expect(
      (await service.read(await fresh(actor), [visible, ...made.slice(0, 49)]))
        .scope.accountIds,
    ).toHaveLength(50);
  } finally {
    await owner.account.deleteMany({ where: { id: { in: made } } });
  }
});
it("keeps provenance unchanged by invisible activity and transaction-only edits", async () => {
  const before = await service.read(await fresh(actor), [visible]);
  for (const accountId of [hidden, visible])
    await owner.transaction.create({
      data: {
        householdId,
        accountId,
        sourceNamespace: "MANUAL",
        sourceId: randomUUID(),
        sourceHash: "a".repeat(64),
        fingerprint: "b".repeat(64),
        amountMinor: -1n,
        bookedDate: new Date("2026-10-01"),
        description: "Private synthetic activity",
      },
    });
  const after = await service.read(await fresh(actor), [visible]);
  expect({ ...after, calculatedAt: before.calculatedAt }).toEqual(before);
});
it.each(["valuation", "revocation", "archive", "logout", "exit"] as const)(
  "fails closed when %s commits between source read and final validation",
  async (kind) => {
    const context = await fresh(viewer),
      accountId = visible;
    const original = repository.readWealthScope;
    const spy = vi
      .spyOn(repository, "readWealthScope")
      .mockImplementationOnce(async (...args) => {
        const rows = await original(...args);
        if (kind === "valuation")
          await owner.balanceSnapshot.create({
            data: {
              householdId,
              accountId,
              authorMembershipId: actor.membershipId,
              amountMinor: 1000000n,
              adultAmountMinor: 600000n,
              asOfDate: new Date(),
            },
          });
        if (kind === "revocation")
          await owner.accountGrant.update({
            where: {
              accountId_membershipId: {
                accountId,
                membershipId: viewer.membershipId,
              },
            },
            data: { level: "NONE", version: { increment: 1 } },
          });
        if (kind === "archive")
          await owner.account.update({
            where: { id: accountId },
            data: { archivedAt: new Date() },
          });
        if (kind === "logout")
          await owner.sessionRegistry.update({
            where: { id: viewer.sessionId },
            data: { revokedAt: new Date() },
          });
        if (kind === "exit")
          await owner.membership.update({
            where: { id: viewer.membershipId },
            data: { status: "LEFT", slot: null },
          });
        return rows;
      });
    try {
      await expect(service.read(context, [visible])).rejects.toMatchObject({
        status: 409,
        response: { error: { code: "SCOPE_CHANGED" } },
      });
    } finally {
      spy.mockRestore();
      await owner.account.update({
        where: { id: accountId },
        data: { archivedAt: null },
      });
      await owner.accountGrant.update({
        where: {
          accountId_membershipId: {
            accountId,
            membershipId: viewer.membershipId,
          },
        },
        data: { level: "TOTALS", version: { increment: 1 } },
      });
      await owner.sessionRegistry.update({
        where: { id: viewer.sessionId },
        data: { revokedAt: null },
      });
    }
  },
);
it("rejects an inactive session before reading evidence", async () => {
  await owner.sessionRegistry.update({
    where: { id: actor.sessionId },
    data: { revokedAt: new Date() },
  });
  try {
    await expect(service.read(await fresh(actor), [visible])).rejects.toThrow();
  } finally {
    await owner.sessionRegistry.update({
      where: { id: actor.sessionId },
      data: { revokedAt: null },
    });
  }
});
