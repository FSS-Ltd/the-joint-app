import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, expect, it } from "vitest";
import type { AuthContext } from "../packages/contracts/dist/index.js";
import { PrismaPg } from "../packages/database/node_modules/@prisma/adapter-pg/dist/index.js";
import { PrismaClient } from "../packages/database/dist/generated/prisma/client.js";
import { createOrm } from "../packages/database/dist/client.js";
import { ScopedDatabase } from "../packages/database/dist/scoped-transaction.js";

const ownerUrl = process.env.MIGRATION_DATABASE_URL;
const runtimeUrl = process.env.DATABASE_URL;
if (!ownerUrl || !runtimeUrl)
  throw new Error(
    "Isolation tests require owner and runtime database configuration",
  );
const owner = createOrm(ownerUrl);
// A dedicated single-connection pool makes success/rollback leakage observable.
const runtime = new PrismaClient({
  adapter: new PrismaPg({
    connectionString: runtimeUrl,
    max: 1,
    connectionTimeoutMillis: 2000,
    statement_timeout: 5000,
  }),
});
const scoped = new ScopedDatabase(runtime);
const householdA = randomUUID();
const householdB = randomUUID();
function actor(householdId: string): AuthContext {
  return {
    userId: randomUUID(),
    membershipId: randomUUID(),
    householdId,
    sessionId: randomUUID(),
    requestId: randomUUID(),
    grantVersion: 0,
    aal: "aal2",
    mfaAuthenticatedAt: Date.now(),
  };
}
const alice = actor(householdA);
const partner = actor(householdA);
const outsider = actor(householdB);
const actors = [alice, partner, outsider];
let accountA: string;
let accountB: string;
async function createAccount(context: AuthContext): Promise<string> {
  return scoped.withScope(context, async (tx) => {
    const account = await tx.account.create({
      data: {
        householdId: context.householdId,
        creatorUserId: context.userId,
        creatorMembershipId: context.membershipId,
        kind: "CURRENT",
        label: "Synthetic private account",
        owners: {
          create: {
            userId: context.userId,
            membershipId: context.membershipId,
          },
        },
      },
    });
    await tx.balanceSnapshot.create({
      data: {
        householdId: context.householdId,
        accountId: account.id,
        authorMembershipId: context.membershipId,
        amountMinor: 12500n,
        asOfDate: new Date("2026-10-23"),
      },
    });
    return account.id;
  });
}
beforeAll(async () => {
  await owner.household.createMany({
    data: [{ id: householdA }, { id: householdB }],
  });
  for (const [index, context] of actors.entries()) {
    await owner.user.create({
      data: {
        id: context.userId,
        memberships: {
          create: {
            id: context.membershipId,
            householdId: context.householdId,
            role: index === 1 ? "ADMIN" : "MEMBER",
            slot: index === 1 ? 2 : 1,
          },
        },
        sessions: {
          create: {
            id: context.sessionId,
            householdId: context.householdId,
            expiresAt: new Date(Date.now() + 300_000),
          },
        },
      },
    });
  }
  accountA = await createAccount(alice);
  accountB = await createAccount(outsider);
});
afterAll(async () => {
  await runtime.$disconnect();
  await owner.account.deleteMany({
    where: { householdId: { in: [householdA, householdB] } },
  });
  await owner.household.deleteMany({
    where: { id: { in: [householdA, householdB] } },
  });
  await owner.user.deleteMany({
    where: { id: { in: actors.map((a) => a.userId) } },
  });
  await owner.$disconnect();
});

it("uses a real nonowner role and denies unscoped, anonymous and privileged finance access", async () => {
  const [role] = await runtime.$queryRaw<
    {
      name: string;
      superuser: boolean;
      bypass: boolean;
      createRole: boolean;
      createDb: boolean;
    }[]
  >`SELECT current_user AS name, rolsuper AS superuser, rolbypassrls AS bypass, rolcreaterole AS "createRole", rolcreatedb AS "createDb" FROM pg_roles WHERE rolname=current_user`;
  expect(role).toEqual({
    name: "joint_app_runtime",
    superuser: false,
    bypass: false,
    createRole: false,
    createDb: false,
  });
  expect(await runtime.account.count()).toBe(0);
  expect(await runtime.balanceSnapshot.count()).toBe(0);
  await expect(
    new ScopedDatabase(owner).withScope(alice, (tx) => tx.account.count()),
  ).rejects.toThrow("restricted runtime");
  await expect(
    runtime.$executeRaw`ALTER TABLE app."Account" DISABLE ROW LEVEL SECURITY`,
  ).rejects.toThrow();
  await expect(
    runtime.$executeRaw`TRUNCATE app."Account" CASCADE`,
  ).rejects.toThrow();
  const tables = await owner.$queryRaw<
    { name: string; enabled: boolean; forced: boolean; publicAccess: boolean }[]
  >`SELECT c.relname AS name,c.relrowsecurity AS enabled,c.relforcerowsecurity AS forced, EXISTS(SELECT 1 FROM aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a WHERE a.grantee=0) AS "publicAccess" FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='app' AND c.relname IN ('Account','AccountOwner','AccountGrant','BalanceSnapshot')`;
  expect(tables).toHaveLength(4);
  for (const table of tables)
    expect(table).toMatchObject({
      enabled: true,
      forced: true,
      publicAccess: false,
    });
  const anonymous = await owner.$queryRaw<
    { unsafe: boolean }[]
  >`SELECT EXISTS(SELECT 1 FROM pg_roles r WHERE r.rolname IN ('anon','authenticated') AND (has_table_privilege(r.oid,'app."Account"','SELECT') OR has_function_privilege(r.oid,'app.account_access(uuid,app."AccountGrantLevel")','EXECUTE'))) AS unsafe`;
  expect(anonymous[0]?.unsafe).toBe(false);
});

it("hides another household and NONE even from a household admin; TOTALS cannot request detail", async () => {
  const existence = await scoped.withScope(
    partner,
    (tx) => tx.$queryRaw<{ hidden: boolean; unknown: boolean }[]>`
    SELECT app.account_has_owner(${accountA}::uuid) AS hidden,
           app.account_has_owner(${randomUUID()}::uuid) AS unknown`,
  );
  expect(existence[0]).toEqual({ hidden: false, unknown: false });
  expect(await scoped.withScope(partner, (tx) => tx.account.count())).toBe(0);
  expect(
    await scoped.withScope(outsider, (tx) =>
      tx.account.findUnique({ where: { id: accountA } }),
    ),
  ).toBeNull();
  await scoped.withScope(alice, (tx) =>
    tx.accountGrant.create({
      data: {
        householdId: householdA,
        accountId: accountA,
        membershipId: partner.membershipId,
        level: "TOTALS",
      },
    }),
  );
  expect(await scoped.withScope(partner, (tx) => tx.account.count())).toBe(1);
  const access = await scoped.withScope(
    partner,
    (tx) =>
      tx.$queryRaw<
        { totals: boolean; details: boolean }[]
      >`SELECT app.account_access(${accountA}::uuid,'TOTALS') AS totals,app.account_access(${accountA}::uuid,'TRANSACTIONS') AS details`,
  );
  expect(access[0]).toEqual({ totals: true, details: false });
  expect(
    await scoped.withScope(partner, (tx) => tx.balanceSnapshot.count()),
  ).toBe(1);
  expect(
    await scoped.withScope(partner, (tx) =>
      tx.account.updateMany({
        where: { id: accountA },
        data: { label: "Forbidden" },
      }),
    ),
  ).toEqual({ count: 0 });
  await expect(
    scoped.withScope(partner, (tx) =>
      tx.balanceSnapshot.create({
        data: {
          householdId: householdA,
          accountId: accountA,
          authorMembershipId: partner.membershipId,
          amountMinor: 1n,
          asOfDate: new Date(),
        },
      }),
    ),
  ).rejects.toThrow();
  await expect(
    scoped.withScope(partner, (tx) =>
      tx.accountGrant.update({
        where: {
          accountId_membershipId: {
            accountId: accountA,
            membershipId: partner.membershipId,
          },
        },
        data: { level: "TRANSACTIONS" },
      }),
    ),
  ).rejects.toThrow();
});

it("requires fresh MFA for wider grants while allowing a downgrade without reauthentication", async () => {
  for (const proof of [null, Date.now() - 301_000, Date.now() + 60_000]) {
    await expect(
      scoped.withScope({ ...alice, mfaAuthenticatedAt: proof }, (tx) =>
        tx.accountGrant.update({
          where: {
            accountId_membershipId: {
              accountId: accountA,
              membershipId: partner.membershipId,
            },
          },
          data: { level: "TRANSACTIONS" },
        }),
      ),
    ).rejects.toThrow();
  }
  await expect(
    scoped.withScope({ ...alice, aal: "aal1" }, (tx) =>
      tx.accountGrant.update({
        where: {
          accountId_membershipId: {
            accountId: accountA,
            membershipId: partner.membershipId,
          },
        },
        data: { level: "TRANSACTIONS" },
      }),
    ),
  ).rejects.toThrow();
  await scoped.withScope({ ...alice, mfaAuthenticatedAt: Date.now() }, (tx) =>
    tx.accountGrant.update({
      where: {
        accountId_membershipId: {
          accountId: accountA,
          membershipId: partner.membershipId,
        },
      },
      data: { level: "TRANSACTIONS" },
    }),
  );
  const access = await scoped.withScope(
    partner,
    (tx) =>
      tx.$queryRaw<
        { allowed: boolean }[]
      >`SELECT app.account_access(${accountA}::uuid,'TRANSACTIONS') AS allowed`,
  );
  expect(access[0]?.allowed).toBe(true);
  await scoped.withScope(
    { ...alice, aal: "aal1", mfaAuthenticatedAt: null },
    (tx) =>
      tx.accountGrant.update({
        where: {
          accountId_membershipId: {
            accountId: accountA,
            membershipId: partner.membershipId,
          },
        },
        data: { level: "NONE" },
      }),
  );
  expect(await scoped.withScope(partner, (tx) => tx.account.count())).toBe(0);
});

it("rejects forged and revoked scopes against live records", async () => {
  for (const context of [
    { ...alice, householdId: householdB },
    { ...alice, membershipId: outsider.membershipId },
    { ...alice, userId: outsider.userId },
    { ...alice, sessionId: partner.sessionId },
    { ...alice, grantVersion: 1 },
  ]) {
    await expect(
      scoped.withScope(context, (tx) => tx.account.count()),
    ).rejects.toThrow("scope");
  }
  await owner.user.update({
    where: { id: alice.userId },
    data: { status: "DISABLED" },
  });
  await expect(
    scoped.withScope(alice, (tx) => tx.account.count()),
  ).rejects.toThrow("scope");
  await owner.user.update({
    where: { id: alice.userId },
    data: { status: "ACTIVE" },
  });
  await owner.membership.update({
    where: { id: alice.membershipId },
    data: { status: "LEFT", slot: null },
  });
  await expect(
    scoped.withScope(alice, (tx) => tx.account.count()),
  ).rejects.toThrow("scope");
  await owner.membership.update({
    where: { id: alice.membershipId },
    data: { status: "ACTIVE", slot: 1 },
  });
  await owner.sessionRegistry.update({
    where: { id: alice.sessionId },
    data: { revokedAt: new Date() },
  });
  await expect(
    scoped.withScope(alice, (tx) => tx.account.count()),
  ).rejects.toThrow("scope");
  await owner.sessionRegistry.update({
    where: { id: alice.sessionId },
    data: { revokedAt: null, expiresAt: new Date(0) },
  });
  await expect(
    scoped.withScope(alice, (tx) => tx.account.count()),
  ).rejects.toThrow("scope");
  await owner.sessionRegistry.update({
    where: { id: alice.sessionId },
    data: { expiresAt: new Date(Date.now() + 300_000) },
  });
  await owner.membership.update({
    where: { id: alice.membershipId },
    data: { grantVersion: 1 },
  });
  await expect(
    scoped.withScope(alice, (tx) => tx.account.count()),
  ).rejects.toThrow("scope");
  await owner.membership.update({
    where: { id: alice.membershipId },
    data: { grantVersion: 0 },
  });
});

it("clears scope after success and rollback when both households reuse one physical connection", async () => {
  const inspect = (context: AuthContext) =>
    scoped.withScope(context, async (tx) => ({
      pid: (
        await tx.$queryRaw<{ pid: number }[]>`SELECT pg_backend_pid() AS pid`
      )[0]?.pid,
      ids: (await tx.account.findMany({ select: { id: true } })).map(
        (a) => a.id,
      ),
    }));
  const first = await inspect(alice);
  expect(first.ids).toEqual([accountA]);
  expect(await runtime.account.count()).toBe(0);
  await expect(
    scoped.withScope(alice, async (tx) => {
      await tx.account.update({
        where: { id: accountA },
        data: { label: "Rollback" },
      });
      throw new Error("synthetic rollback");
    }),
  ).rejects.toThrow("synthetic rollback");
  const second = await inspect(outsider);
  expect(second.pid).toBe(first.pid);
  expect(second.ids).toEqual([accountB]);
  expect(await runtime.account.count()).toBe(0);
  expect((await inspect(alice)).ids).toEqual([accountA]);
});

it("keeps ownership, account identity and valuations immutable, and rejects tenant-mismatched references", async () => {
  await expect(
    scoped.withScope(alice, (tx) =>
      tx.accountOwner.create({
        data: {
          householdId: householdA,
          accountId: accountA,
          userId: partner.userId,
          membershipId: partner.membershipId,
        },
      }),
    ),
  ).rejects.toThrow();
  await expect(
    scoped.withScope(alice, (tx) =>
      tx.account.update({ where: { id: accountA }, data: { kind: "SAVINGS" } }),
    ),
  ).rejects.toThrow();
  await expect(
    scoped.withScope(alice, (tx) =>
      tx.accountOwner.updateMany({
        where: { accountId: accountA },
        data: { status: "ARCHIVED" },
      }),
    ),
  ).rejects.toThrow();
  await expect(
    scoped.withScope(alice, (tx) =>
      tx.balanceSnapshot.updateMany({
        where: { accountId: accountA },
        data: { amountMinor: 0n },
      }),
    ),
  ).rejects.toThrow();
  await expect(
    scoped.withScope(alice, (tx) =>
      tx.balanceSnapshot.deleteMany({ where: { accountId: accountA } }),
    ),
  ).rejects.toThrow();
  await expect(
    owner.accountGrant.create({
      data: {
        householdId: householdB,
        accountId: accountA,
        membershipId: outsider.membershipId,
        level: "NONE",
      },
    }),
  ).rejects.toThrow();
  await expect(
    owner.accountOwner.create({
      data: {
        householdId: householdA,
        accountId: accountA,
        membershipId: outsider.membershipId,
        userId: outsider.userId,
      },
    }),
  ).rejects.toThrow();
  await expect(
    owner.balanceSnapshot.create({
      data: {
        householdId: householdA,
        accountId: accountA,
        authorMembershipId: outsider.membershipId,
        amountMinor: 1n,
        asOfDate: new Date(),
      },
    }),
  ).rejects.toThrow();
  const debt = await owner.account.create({
    data: {
      householdId: householdA,
      creatorUserId: alice.userId,
      creatorMembershipId: alice.membershipId,
      kind: "LOAN",
      label: "Synthetic debt",
    },
  });
  await expect(
    owner.balanceSnapshot.create({
      data: {
        householdId: householdA,
        accountId: debt.id,
        authorMembershipId: alice.membershipId,
        amountMinor: -1n,
        asOfDate: new Date(),
      },
    }),
  ).rejects.toThrow();
});

it("denies an actual unprivileged database role and keeps policy helpers private", async () => {
  const role = `joint_isolation_${randomUUID().replaceAll("-", "")}`;
  // This identifier contains only a fixed prefix and a generated UUID.
  await owner.$executeRawUnsafe(`CREATE ROLE "${role}" NOLOGIN`);
  try {
    await expect(
      owner.$transaction(async (tx) => {
        await tx.$executeRawUnsafe(`SET LOCAL ROLE "${role}"`);
        await tx.account.findMany();
      }),
    ).rejects.toThrow();
    await expect(
      owner.$transaction(async (tx) => {
        await tx.$executeRawUnsafe(`SET LOCAL ROLE "${role}"`);
        await tx.$queryRaw`SELECT app.scope_is_valid()`;
      }),
    ).rejects.toThrow();
    const helpers = await owner.$queryRaw<
      {
        name: string;
        owner: string;
        settings: string[];
        publicExecute: boolean;
      }[]
    >`SELECT p.proname AS name,pg_get_userbyid(p.proowner) AS owner,p.proconfig AS settings,EXISTS(SELECT 1 FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE a.grantee=0 AND a.privilege_type='EXECUTE') AS "publicExecute" FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='app' AND p.prosecdef`;
    expect(helpers.length).toBeGreaterThanOrEqual(5);
    for (const helper of helpers) {
      expect(helper.owner).not.toBe("joint_app_runtime");
      expect(helper.settings).toContain("search_path=pg_catalog");
      expect(helper.publicExecute).toBe(false);
    }
  } finally {
    await owner.$executeRawUnsafe(`DROP ROLE "${role}"`);
  }
});

it("rechecks the grant epoch on the next statement of an already-open scoped transaction", async () => {
  try {
    await scoped.withScope(alice, async (tx) => {
      expect(await tx.account.count({ where: { id: accountA } })).toBe(1);
      await owner.membership.update({
        where: { id: alice.membershipId },
        data: { grantVersion: 1 },
      });
      expect(await tx.account.count()).toBe(0);
    });
  } finally {
    await owner.membership.update({
      where: { id: alice.membershipId },
      data: { grantVersion: 0 },
    });
  }
});

it("cannot bypass immutable finance rows through parent cascades or hidden-account validation", async () => {
  await expect(
    runtime.household.delete({ where: { id: householdA } }),
  ).rejects.toThrow();
  await expect(
    runtime.membership.delete({ where: { id: alice.membershipId } }),
  ).rejects.toThrow();
  expect(await owner.account.count({ where: { id: accountA } })).toBe(1);
  expect(
    await owner.balanceSnapshot.count({ where: { accountId: accountA } }),
  ).toBe(1);
  const hidden = await owner.account.findFirstOrThrow({
    where: { householdId: householdA, kind: "LOAN" },
  });
  await expect(
    scoped.withScope(outsider, (tx) =>
      tx.balanceSnapshot.create({
        data: {
          householdId: householdA,
          accountId: hidden.id,
          authorMembershipId: outsider.membershipId,
          amountMinor: -1n,
          asOfDate: new Date(),
        },
      }),
    ),
  ).rejects.toThrow("row-level security policy");
});

it("denies parent identity updates that could rewrite finance references through cascades", async () => {
  await expect(
    runtime.household.update({
      where: { id: householdA },
      data: { id: householdA },
    }),
  ).rejects.toThrow();
  await expect(
    runtime.membership.update({
      where: { id: alice.membershipId },
      data: { userId: alice.userId },
    }),
  ).rejects.toThrow();
  await expect(
    runtime.membership.update({
      where: { id: alice.membershipId },
      data: { householdId: householdA },
    }),
  ).rejects.toThrow();
  await expect(
    runtime.user.update({
      where: { id: alice.userId },
      data: { id: alice.userId },
    }),
  ).rejects.toThrow();
  expect(
    await owner.accountOwner.findUnique({
      where: {
        accountId_userId: { accountId: accountA, userId: alice.userId },
      },
    }),
  ).toMatchObject({
    householdId: householdA,
    membershipId: alice.membershipId,
  });
});
