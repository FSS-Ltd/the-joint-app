import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, expect, it } from "vitest";
import type { AuthContext } from "../packages/contracts/dist/index.js";
import { createOrm } from "../packages/database/dist/client.js";
import { ScopedDatabase } from "../packages/database/dist/scoped-transaction.js";
import { ArchiveDatabase } from "../packages/database/dist/archive-transaction.js";
import { fundingSources } from "./fixtures/funding-sources.js";
import { createFixtureOwner } from "./fixtures/database.js";
const owner = createFixtureOwner();
if (!process.env.DATABASE_URL) throw Error("Runtime database required");
const runtime = createOrm(process.env.DATABASE_URL),
  scoped = new ScopedDatabase(runtime),
  archive = new ArchiveDatabase(runtime);
const hh = randomUUID(),
  account = randomUUID(),
  valuation = randomUUID();
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
interface Evidence {
  version: number;
  valuationId: string;
  settledAdultMoney: { amountMinor: string };
  billReserves: { amountMinor: string };
}
interface Page {
  current: Evidence | null;
  history: Evidence[];
  nextAfterVersion: number | null;
}
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
beforeAll(async () => {
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
  await owner.accountGrant.create({
    data: {
      householdId: hh,
      accountId: account,
      membershipId: b.membershipId,
      level: "TRANSACTIONS",
    },
  });
});
afterAll(async () => {
  await owner.account.deleteMany({ where: { householdId: hh } });
  await owner.household.deleteMany({ where: { id: hh } });
  await owner.auditEvent.deleteMany({
    where: { userId: { in: [a.userId, b.userId] } },
  });
  await owner.sessionRegistry.deleteMany({
    where: { userId: { in: [a.userId, b.userId] } },
  });
  await owner.user.deleteMany({ where: { id: { in: [a.userId, b.userId] } } });
  await Promise.all([owner.$disconnect(), runtime.$disconnect()]);
});
it("requires ownership rather than a read grant, and preserves exact amounts", async () => {
  expect((await read())?.current).toBeNull();
  await expect(read(b)).rejects.toBeDefined();
  await expect(write(b, 0)).rejects.toBeDefined();
  const before = await owner.account.findUniqueOrThrow({
    where: { id: account },
  });
  expect(await write(a, 0)).toMatchObject({ ...data, version: 1 });
  const after = await owner.account.findUniqueOrThrow({
    where: { id: account },
  });
  expect([after.version, after.totalsVersion]).toEqual([
    before.version,
    before.totalsVersion,
  ]);
});
it("pins settlement, permits reserve revisions, and serializes optimistic writers", async () => {
  await expect(
    write(a, 1, {
      ...data,
      settledAdultMoney: { amountMinor: "1", currency: "GBP" },
    }),
  ).rejects.toBeDefined();
  const revisions = await Promise.allSettled([
    write(a, 1, {
      ...data,
      billReserves: { amountMinor: "200", currency: "GBP" },
    }),
    write(a, 1, {
      ...data,
      billReserves: { amountMinor: "300", currency: "GBP" },
    }),
  ]);
  expect(revisions.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  expect((await read())?.history).toHaveLength(2);
  await expect(
    scoped.withScope(
      a,
      (tx) => tx.$queryRaw`SELECT * FROM app."FundingEvidence"`,
    ),
  ).rejects.toBeDefined();
  await expect(
    owner.$executeRaw`UPDATE app."FundingEvidence" SET "billReservesMinor"=0 WHERE "accountId"=${account}::uuid`,
  ).rejects.toBeDefined();
  await expect(
    owner.$executeRaw`DELETE FROM app."FundingEvidence" WHERE "accountId"=${account}::uuid`,
  ).rejects.toBeDefined();
});
it("rejects malformed, stale, incomplete and non-latest source evidence", async () => {
  for (const input of [
    { ...data, valuationId: randomUUID() },
    { ...data, billReserves: { amountMinor: "-1", currency: "GBP" } },
    {
      ...data,
      settledAdultMoney: { amountMinor: "9007199254740994", currency: "GBP" },
    },
    { ...data, billReserves: null },
    { ...data, extra: true },
  ])
    await expect(write(a, 2, input)).rejects.toBeDefined();
  const newer = randomUUID();
  await owner.balanceSnapshot.create({
    data: {
      id: newer,
      householdId: hh,
      accountId: account,
      amountMinor: 100n,
      adultAmountMinor: 100n,
      authorMembershipId: a.membershipId,
      asOfDate: new Date(new Date().toISOString().slice(0, 10)),
      createdAt: new Date(Date.now() + 1000),
    },
  });
  await expect(write(a, 2)).rejects.toBeDefined();
  const valid = {
    ...data,
    valuationId: newer,
    settledAdultMoney: { amountMinor: "0", currency: "GBP" },
  };
  await owner.account.update({
    where: { id: account },
    data: { liquidity: "RESTRICTED" },
  });
  await expect(write(a, 2, valid)).rejects.toBeDefined();
  await owner.account.update({
    where: { id: account },
    data: { liquidity: "AVAILABLE" },
  });
  expect(await write(a, 2, valid)).toMatchObject({
    version: 3,
    valuationId: newer,
  });
});
it.each(fundingSources)(
  "checks source eligibility $kind $liquidity age=$age settled=$settled",
  async (item) => {
    const id = randomUUID(),
      vid = randomUUID();
    await owner.account.create({
      data: {
        id,
        householdId: hh,
        creatorUserId: a.userId,
        creatorMembershipId: a.membershipId,
        kind: item.kind,
        liquidity: item.liquidity,
        label: "Synthetic boundary",
      },
    });
    await owner.accountOwner.create({
      data: {
        householdId: hh,
        accountId: id,
        userId: a.userId,
        membershipId: a.membershipId,
      },
    });
    const [clock] = await owner.$queryRaw<
      { today: Date }[]
    >`SELECT (statement_timestamp() AT TIME ZONE 'Europe/London')::date AS today`;
    if (!clock) throw Error("Missing database clock");
    const date = new Date(clock.today);
    date.setUTCDate(date.getUTCDate() - item.age);
    const recorded = owner.balanceSnapshot.create({
      data: {
        id: vid,
        householdId: hh,
        accountId: id,
        authorMembershipId: a.membershipId,
        amountMinor: item.amount,
        adultAmountMinor: item.adult,
        asOfDate: date,
        complete: item.complete,
      },
    });
    if (!item.complete) {
      await expect(recorded).rejects.toBeDefined();
      return;
    }
    await recorded;
    const input = JSON.stringify({
      valuationId: vid,
      settledAdultMoney: { amountMinor: item.settled, currency: "GBP" },
      billReserves: { amountMinor: "200", currency: "GBP" },
    });
    const result = scoped.withScope(
      a,
      (tx) =>
        tx.$queryRaw`SELECT app.write_funding_evidence(${id}::uuid,0,${input}::jsonb)`,
    );
    if (item.allowed) await expect(result).resolves.toBeDefined();
    else await expect(result).rejects.toBeDefined();
  },
);
it("freezes joint-owner planning at exit", async () => {
  await owner.accountOwner.create({
    data: {
      householdId: hh,
      accountId: account,
      userId: b.userId,
      membershipId: b.membershipId,
    },
  });
  await scoped.withScope(a, (tx) => tx.$queryRaw`SELECT app.leave_household()`);
  for (const c of [a, b]) {
    c.sessionId = randomUUID();
    await owner.sessionRegistry.create({
      data: {
        id: c.sessionId,
        userId: c.userId,
        householdId: c === a ? null : hh,
        expiresAt: new Date(Date.now() + 600000),
      },
    });
  }
  b.grantVersion = (
    await owner.membership.findUniqueOrThrow({ where: { id: b.membershipId } })
  ).grantVersion;
  const latest = (await read(b))?.current;
  if (!latest) throw Error("Missing latest evidence");
  await write(b, 3, {
    valuationId: latest.valuationId,
    settledAdultMoney: latest.settledAdultMoney,
    billReserves: { amountMinor: "999", currency: "GBP" },
  });
  const result = await archive.withScope(
    {
      userId: a.userId,
      sessionId: a.sessionId,
      requestId: randomUUID(),
      aal: "aal2",
      mfaAuthenticatedAt: Date.now(),
    },
    async (tx) =>
      (
        await tx.$queryRaw<
          { data: Page }[]
        >`SELECT app.read_funding_evidence(${account}::uuid,0) AS data`
      )[0]?.data,
  );
  expect(result?.current?.version).toBe(3);
  expect(result?.history).toHaveLength(3);
  expect((await read(b))?.current?.version).toBe(4);
});
