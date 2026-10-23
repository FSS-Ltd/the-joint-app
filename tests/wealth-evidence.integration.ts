import { randomBytes, randomUUID } from "node:crypto";
import { afterAll, beforeAll, expect, it } from "vitest";
import {
  accountSchema,
  type AuthContext,
} from "../packages/contracts/dist/index.js";
import { createOrm } from "../packages/database/dist/client.js";
import { ScopedDatabase } from "../packages/database/dist/scoped-transaction.js";
import { AccountMutations } from "../apps/api/src/modules/accounts/account-mutations.js";
import {
  IdentityVault,
  hashToken,
} from "../apps/api/src/modules/identity/identity-vault.js";
import { RequestReplay } from "../apps/api/src/modules/households/request-replay.js";
import { ArchiveDatabase } from "../packages/database/dist/archive-transaction.js";
import { readArchiveAccount } from "../apps/api/src/modules/archive/archive-projection.js";
import { readAccount } from "../apps/api/src/modules/accounts/account-projection.js";
import { createFixtureOwner } from "./fixtures/database.js";

const owner = createFixtureOwner();
if (!process.env.DATABASE_URL)
  throw new Error("Local runtime database required");
const runtime = createOrm(process.env.DATABASE_URL);
const database = new ScopedDatabase(runtime);
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
const key = randomBytes(32).toString("base64");
const vault = new IdentityVault(key, key);
const mutations = new AccountMutations(database, vault);
const money = (amountMinor: string) => ({
  amountMinor,
  currency: "GBP" as const,
});
const evidence = {
  money: money("1000000"),
  adultMoney: money("700000"),
  asOfDate: "2026-01-01",
};

beforeAll(async () => {
  await owner.household.create({ data: { id: householdId } });
  for (const [index, context] of [actor, viewer].entries())
    await owner.user.create({
      data: {
        id: context.userId,
        memberships: {
          create: { id: context.membershipId, householdId, slot: index + 1 },
        },
        sessions: {
          create: {
            id: context.sessionId,
            householdId,
            expiresAt: new Date(Date.now() + 600000),
          },
        },
      },
    });
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
  await runtime.$disconnect();
  await owner.$disconnect();
});
async function createAccount(kind: "SAVINGS" | "CURRENT" | "LOAN" = "SAVINGS") {
  return mutations.create(
    actor,
    {
      kind,
      label: "Synthetic wealth evidence",
      currency: "GBP",
      liquidity: "AVAILABLE",
    },
    randomUUID(),
  );
}

it("preserves original money, historical unknowns and immutable adult attestations", async () => {
  const account = await createAccount();
  const legacy = await mutations.value(
    actor,
    account.id,
    { money: evidence.money, asOfDate: evidence.asOfDate },
    account.version,
    randomUUID(),
  );
  expect(legacy.latestValuation?.adultMoney).toBeNull();
  const result = await mutations.value(
    actor,
    account.id,
    evidence,
    legacy.version,
    randomUUID(),
  );
  expect(result.latestValuation).toMatchObject(evidence);
  const rows = await owner.$queryRaw<
    { amountMinor: bigint; adultAmountMinor: bigint | null }[]
  >`
    SELECT "amountMinor", "adultAmountMinor" FROM app."BalanceSnapshot"
    WHERE "accountId"=${account.id}::uuid ORDER BY "createdAt",id`;
  expect(rows).toEqual([
    { amountMinor: 1000000n, adultAmountMinor: null },
    { amountMinor: 1000000n, adultAmountMinor: 700000n },
  ]);
  await expect(
    database.withScope(
      actor,
      (tx) => tx.$executeRaw`
    UPDATE app."BalanceSnapshot" SET "adultAmountMinor"=0 WHERE "accountId"=${account.id}::uuid`,
    ),
  ).rejects.toThrow();
});

it("binds attestation changes to optimistic versions and idempotent payloads", async () => {
  const account = await createAccount();
  const requestKey = randomUUID();
  const result = await mutations.value(
    actor,
    account.id,
    evidence,
    account.version,
    requestKey,
  );
  const replayed = await mutations.value(
    actor,
    account.id,
    evidence,
    account.version,
    requestKey,
  );
  expect(replayed.latestValuation?.id).toBe(result.latestValuation?.id);
  await expect(
    mutations.value(
      actor,
      account.id,
      { ...evidence, adultMoney: money("600000") },
      account.version,
      requestKey,
    ),
  ).rejects.toMatchObject({ status: 409 });
  await expect(
    mutations.value(actor, account.id, evidence, account.version, randomUUID()),
  ).rejects.toMatchObject({ status: 409 });
  expect(
    await owner.balanceSnapshot.count({ where: { accountId: account.id } }),
  ).toBe(1);
});

it("reads a historical replay without inventing an attestation or another valuation", async () => {
  const account = await createAccount();
  const input = { money: evidence.money, asOfDate: evidence.asOfDate };
  const valued = await mutations.value(
    actor,
    account.id,
    input,
    account.version,
    randomUUID(),
  );
  const snapshot = valued.latestValuation;
  if (!snapshot) throw new Error("Expected recorded synthetic valuation");
  const historical = {
    ...valued,
    latestValuation: {
      id: snapshot.id,
      money: snapshot.money,
      asOfDate: snapshot.asOfDate,
      recordedAt: snapshot.recordedAt,
      complete: snapshot.complete,
      source: snapshot.source,
    },
  };
  const requestKey = randomUUID();
  const replay = new RequestReplay(vault);
  await database.withScope(actor, (tx) =>
    replay.save(
      tx,
      actor.userId,
      `valuation:${account.id}`,
      requestKey,
      hashToken(JSON.stringify(input)),
      historical,
    ),
  );
  const result = await mutations.value(
    actor,
    account.id,
    input,
    account.version,
    requestKey,
  );
  expect(accountSchema.parse(result).latestValuation?.adultMoney).toBeNull();
  expect(result.latestValuation?.id).toBe(snapshot.id);
  expect(
    await owner.balanceSnapshot.count({ where: { accountId: account.id } }),
  ).toBe(1);
});

it("keeps totals viewers read-only while exposing the attested valuation amount", async () => {
  const account = await createAccount();
  const valued = await mutations.value(
    actor,
    account.id,
    evidence,
    account.version,
    randomUUID(),
  );
  await owner.accountGrant.create({
    data: {
      householdId,
      accountId: account.id,
      membershipId: viewer.membershipId,
      level: "TOTALS",
    },
  });
  const membership = await owner.membership.findUniqueOrThrow({
    where: { id: viewer.membershipId },
  });
  const freshViewer = { ...viewer, grantVersion: membership.grantVersion };
  await expect(
    mutations.value(
      freshViewer,
      account.id,
      evidence,
      valued.version,
      randomUUID(),
    ),
  ).rejects.toMatchObject({ status: 404 });
  const [scope] = await database.withScope(
    freshViewer,
    (tx) =>
      tx.$queryRaw<{ valid: boolean }[]>`SELECT app.scope_is_valid() AS valid`,
  );
  expect(scope?.valid).toBe(true);
  expect(
    (
      await database.withScope(freshViewer, (tx) =>
        readAccount(tx, freshViewer, account.id),
      )
    ).latestValuation?.adultMoney,
  ).toEqual(evidence.adultMoney);
  const rows = await database.withScope(
    freshViewer,
    (tx) => tx.$queryRaw<{ adultAmountMinor: bigint | null }[]>`
    SELECT "adultAmountMinor" FROM app."BalanceSnapshot" WHERE "accountId"=${account.id}::uuid`,
  );
  expect(rows).toEqual([{ adultAmountMinor: 700000n }]);
});

it("rejects invalid portions and partial liability claims through direct runtime SQL", async () => {
  const savings = await createAccount();
  const debt = await createAccount("LOAN");
  for (const [accountId, amount, adult] of [
    [savings.id, 100n, 101n],
    [savings.id, 100n, -1n],
    [savings.id, -100n, 0n],
    [debt.id, 100n, 99n],
  ] as const)
    await expect(
      database.withScope(
        actor,
        (tx) => tx.$executeRaw`
      INSERT INTO app."BalanceSnapshot" (id,"householdId","accountId","authorMembershipId","amountMinor","adultAmountMinor","asOfDate")
      VALUES (${randomUUID()}::uuid,${householdId}::uuid,${accountId}::uuid,${actor.membershipId}::uuid,${amount},${adult},'2026-01-01'::date)`,
      ),
    ).rejects.toThrow();
  await expect(
    mutations.value(
      actor,
      debt.id,
      { ...evidence, adultMoney: money("0") },
      debt.version,
      randomUUID(),
    ),
  ).rejects.toMatchObject({ status: 400 });
  const valued = await mutations.value(
    actor,
    debt.id,
    { ...evidence, adultMoney: evidence.money },
    debt.version,
    randomUUID(),
  );
  expect(valued.latestValuation?.adultMoney).toEqual(evidence.money);
});

it("retains attestation in the owner's read-only archive after household exit", async () => {
  const account = await createAccount();
  await mutations.value(
    actor,
    account.id,
    evidence,
    account.version,
    randomUUID(),
  );
  await owner.accountOwner.updateMany({
    where: { accountId: account.id },
    data: { status: "ARCHIVED" },
  });
  await owner.membership.update({
    where: { id: actor.membershipId },
    data: { status: "LEFT", slot: null },
  });
  await owner.sessionRegistry.update({
    where: { id: actor.sessionId },
    data: { householdId: null },
  });
  const archived = await new ArchiveDatabase(runtime).withScope(actor, (tx) =>
    readArchiveAccount(tx, account.id),
  );
  expect(archived.latestValuation).toMatchObject(evidence);
  expect(archived.permissions.canValue).toBe(false);
  await expect(
    database.withScope(actor, (tx) => readAccount(tx, actor, account.id)),
  ).rejects.toThrow();
});
