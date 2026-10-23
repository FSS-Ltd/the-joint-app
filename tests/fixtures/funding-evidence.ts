import { randomUUID } from "node:crypto";
import type { AuthContext } from "../../packages/contracts/dist/index.js";
import { createOrm } from "../../packages/database/dist/client.js";
import { ScopedDatabase } from "../../packages/database/dist/scoped-transaction.js";
import { ArchiveDatabase } from "../../packages/database/dist/archive-transaction.js";
import { createFixtureOwner } from "./database.js";
export interface Evidence {
  version: number;
  valuationId: string;
  settledAdultMoney: { amountMinor: string };
  billReserves: { amountMinor: string };
}
export interface Page {
  current: Evidence | null;
  history: Evidence[];
  nextAfterVersion: number | null;
}

export function createFundingEvidenceFixture() {
  const owner = createFixtureOwner();
  if (!process.env.DATABASE_URL) throw Error("Runtime database required");
  const runtime = createOrm(process.env.DATABASE_URL),
    scoped = new ScopedDatabase(runtime),
    archive = new ArchiveDatabase(runtime);
  const hh = randomUUID(),
    account = randomUUID(),
    valuation = randomUUID(),
    emptyAccount = randomUUID(),
    emptyValuation = randomUUID();
  function actor(slot: number): AuthContext {
    return {
      userId: randomUUID(),
      membershipId: randomUUID(),
      sessionId: randomUUID(),
      householdId: hh,
      grantVersion: 0,
      aal: "aal2",
      mfaAuthenticatedAt: Date.now(),
      requestId: String(slot),
    };
  }
  const a = actor(1),
    b = actor(2);
  const data = {
    valuationId: valuation,
    settledAdultMoney: { amountMinor: "9007199254740993", currency: "GBP" },
    billReserves: { amountMinor: "100", currency: "GBP" },
  };
  async function write(
    c: AuthContext,
    version: number,
    input: unknown = data,
  ): Promise<Evidence> {
    return scoped.withScope(c, async (tx) => {
      const [row] = await tx.$queryRaw<
        { data: Evidence }[]
      >`SELECT app.write_funding_evidence(${account}::uuid,${version}::integer,${JSON.stringify(input)}::jsonb) AS data`;
      if (!row) throw Error("Missing evidence");
      return row.data;
    });
  }
  async function read(c = a): Promise<Page | undefined> {
    return scoped.withScope(
      c,
      async (tx) =>
        (
          await tx.$queryRaw<
            { data: Page }[]
          >`SELECT app.read_funding_evidence(${account}::uuid,0) AS data`
        )[0]?.data,
    );
  }
  async function setup(): Promise<void> {
    await owner.household.create({ data: { id: hh } });
    for (const [index, c] of [a, b].entries()) {
      await owner.user.create({ data: { id: c.userId } });
      await owner.membership.create({
        data: {
          id: c.membershipId,
          userId: c.userId,
          householdId: hh,
          slot: index + 1,
        },
      });
      await owner.sessionRegistry.create({
        data: {
          id: c.sessionId,
          userId: c.userId,
          householdId: hh,
          expiresAt: new Date(Date.now() + 600000),
        },
      });
    }
    await owner.account.create({
      data: {
        id: account,
        householdId: hh,
        creatorUserId: a.userId,
        creatorMembershipId: a.membershipId,
        kind: "CURRENT",
        label: "Synthetic funding",
      },
    });
    await owner.accountOwner.create({
      data: {
        accountId: account,
        householdId: hh,
        userId: a.userId,
        membershipId: a.membershipId,
      },
    });
    await owner.balanceSnapshot.create({
      data: {
        accountId: account,
        id: valuation,
        householdId: hh,
        amountMinor: 9007199254740993n,
        adultAmountMinor: 9007199254740993n,
        authorMembershipId: a.membershipId,
        asOfDate: new Date(new Date().toISOString().slice(0, 10)),
      },
    });
    await owner.account.create({
      data: {
        id: emptyAccount,
        householdId: hh,
        creatorUserId: a.userId,
        creatorMembershipId: a.membershipId,
        kind: "CURRENT",
        label: "Synthetic empty funding",
        legalOwnerKind: "JOINT_ADULT",
      },
    });
    for (const c of [a, b])
      await owner.accountOwner.create({
        data: {
          accountId: emptyAccount,
          householdId: hh,
          userId: c.userId,
          membershipId: c.membershipId,
        },
      });
    await owner.balanceSnapshot.create({
      data: {
        id: emptyValuation,
        householdId: hh,
        accountId: emptyAccount,
        authorMembershipId: a.membershipId,
        amountMinor: 100n,
        adultAmountMinor: 100n,
        asOfDate: new Date(new Date().toISOString().slice(0, 10)),
      },
    });
    await owner.accountGrant.create({
      data: {
        householdId: hh,
        accountId: account,
        membershipId: b.membershipId,
        level: "TRANSACTIONS",
      },
    });
  }
  async function close(): Promise<void> {
    await owner.account.deleteMany({ where: { householdId: hh } });
    await owner.household.deleteMany({ where: { id: hh } });
    await owner.auditEvent.deleteMany({
      where: { userId: { in: [a.userId, b.userId] } },
    });
    await owner.deletionRequest.deleteMany({
      where: { userId: { in: [a.userId, b.userId] } },
    });
    await owner.sessionRegistry.deleteMany({
      where: { userId: { in: [a.userId, b.userId] } },
    });
    await owner.requestKey.deleteMany({
      where: { userId: { in: [a.userId, b.userId] } },
    });
    await owner.user.deleteMany({
      where: { id: { in: [a.userId, b.userId] } },
    });
    await Promise.all([owner.$disconnect(), runtime.$disconnect()]);
  }

  return {
    owner,
    runtime,
    scoped,
    archive,
    hh,
    account,
    valuation,
    emptyAccount,
    emptyValuation,
    a,
    b,
    data,
    write,
    read,
    setup,
    close,
  };
}
