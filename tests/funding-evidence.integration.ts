import { randomBytes, randomUUID } from "node:crypto";
import { afterAll, beforeAll, expect, it } from "vitest";
import { DeletionRepository } from "../packages/database/dist/deletion.repository.js";
import { fundingSources } from "./fixtures/funding-sources.js";
import {
  createFundingEvidenceFixture,
  type Page,
} from "./fixtures/funding-evidence.js";
const f = createFundingEvidenceFixture();
const {
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
} = f;
beforeAll(f.setup);
afterAll(f.close);
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
    owner.balanceSnapshot.update({
      where: { id: valuation },
      data: { amountMinor: 9007199254740994n },
    }),
  ).rejects.toBeDefined();

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
  await scoped.withScope(
    b,
    (tx) =>
      tx.$queryRaw`SELECT app.write_funding_evidence(${emptyAccount}::uuid,0,${JSON.stringify({ valuationId: emptyValuation, settledAdultMoney: { amountMinor: "100", currency: "GBP" }, billReserves: { amountMinor: "20", currency: "GBP" } })}::jsonb)`,
  );
  const archivedOwner = await owner.accountOwner.update({
    where: { accountId_userId: { accountId: emptyAccount, userId: a.userId } },
    data: { fundingCutoffVersion: 999 },
  });
  expect(archivedOwner.fundingCutoffVersion).toBe(0);
  const emptyPage = await archive.withScope(
    a,
    async (tx) =>
      (
        await tx.$queryRaw<
          { data: Page }[]
        >`SELECT app.read_funding_evidence(${emptyAccount}::uuid,0) AS data`
      )[0]?.data,
  );
  expect(emptyPage).toEqual({
    current: null,
    history: [],
    nextAfterVersion: null,
  });
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

it("actual deletion removes exclusive evidence and later private reserves without changing the frozen archive", async () => {
  const exclusive = randomUUID(),
    vid = randomUUID();
  await owner.account.create({
    data: {
      id: exclusive,
      householdId: hh,
      creatorUserId: b.userId,
      creatorMembershipId: b.membershipId,
      kind: "CURRENT",
      label: "Synthetic exclusive",
    },
  });
  await owner.accountOwner.create({
    data: {
      householdId: hh,
      accountId: exclusive,
      userId: b.userId,
      membershipId: b.membershipId,
    },
  });
  await owner.balanceSnapshot.create({
    data: {
      id: vid,
      householdId: hh,
      accountId: exclusive,
      authorMembershipId: b.membershipId,
      amountMinor: 100n,
      adultAmountMinor: 100n,
      asOfDate: new Date(new Date().toISOString().slice(0, 10)),
    },
  });
  await scoped.withScope(
    b,
    (tx) =>
      tx.$queryRaw`SELECT app.write_funding_evidence(${exclusive}::uuid,0,${JSON.stringify({ valuationId: vid, settledAdultMoney: { amountMinor: "100", currency: "GBP" }, billReserves: { amountMinor: "0", currency: "GBP" } })}::jsonb)`,
  );
  const repository = new DeletionRepository(runtime),
    request = await repository.request(
      b,
      randomUUID(),
      randomBytes(32).toString("hex"),
      new Date(Date.now() + 600000),
    ),
    lease = await repository.claim(request.id);
  if (!lease) throw Error("Missing deletion lease");
  await repository.purge(lease.id, lease.leaseToken);
  expect(
    await owner.fundingEvidence.count({ where: { accountId: exclusive } }),
  ).toBe(0);
  expect(
    await owner.fundingEvidence.count({ where: { accountId: emptyAccount } }),
  ).toBe(0);
  const retained = await owner.fundingEvidence.findMany({
    where: { accountId: account },
    orderBy: { version: "asc" },
  });
  expect(retained.map((e) => e.version)).toEqual([1, 2, 3]);
  const result = await archive.withScope(
    a,
    async (tx) =>
      (
        await tx.$queryRaw<
          { data: Page }[]
        >`SELECT app.read_funding_evidence(${account}::uuid,0) AS data`
      )[0]?.data,
  );
  expect(result?.current?.version).toBe(3);
  await repository.purge(lease.id, lease.leaseToken);
  expect(
    await owner.fundingEvidence.count({ where: { accountId: account } }),
  ).toBe(3);
  await repository.finish(lease.id, lease.leaseToken, true);
});
