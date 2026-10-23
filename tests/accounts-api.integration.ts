import { randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import {
  accountListSchema,
  accountSchema,
  authResultSchema,
  authServerEnvironmentSchema,
  mfaEnrollmentSchema,
  type AuthContext,
} from "../packages/contracts/dist/index.js";
import { createDatabase } from "../packages/database/dist/index.js";
import { createOrm } from "../packages/database/dist/client.js";
import { ScopedDatabase } from "../packages/database/dist/scoped-transaction.js";
import { createApplication } from "../apps/api/dist/application.js";
import { AccountAccessService } from "../apps/api/dist/modules/accounts/account-access.service.js";
import { AccountGrants } from "../apps/api/dist/modules/accounts/account-grants.js";
import { createLocalAuthFixture, totp } from "./fixtures/local-auth.js";

it("enforces real-runtime private accounts, owner writes, grant epochs and fresh MFA through HTTP", async () => {
  const runtimeUrl = process.env.DATABASE_URL;
  const ownerUrl = process.env.MIGRATION_DATABASE_URL;
  if (!runtimeUrl || !ownerUrl)
    throw new Error("Runtime and migration URLs are required");
  const runtime = createOrm(runtimeUrl);
  const owner = createOrm(ownerUrl);
  const health = createDatabase(runtimeUrl, 500);
  const auth = createLocalAuthFixture();
  const app = await createApplication(health, undefined, {
    database: runtime,
    environment: authServerEnvironmentSchema.parse(process.env),
  });
  const users: string[] = [];
  const householdId = randomUUID();
  const otherHouseholdId = randomUUID();
  try {
    await app.listen(0, "127.0.0.1");
    const base = await app.getUrl();
    async function request(
      path: string,
      token?: string,
      method = "GET",
      body?: unknown,
      headers: Record<string, string> = {},
    ): Promise<Response> {
      return fetch(`${base}/v1${path}`, {
        method,
        headers: {
          ...(token ? { Authorization: `Session ${token}` } : {}),
          ...(body === undefined ? {} : { "Content-Type": "application/json" }),
          ...headers,
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
    }
    async function user() {
      const account = await auth.createConfirmedUser();
      users.push(account.session.user.id);
      const response = await request("/auth/login", undefined, "POST", {
        email: account.email,
        password: account.password,
      });
      expect(response.ok).toBe(true);
      const login = authResultSchema.parse(await response.json());
      if (!login.browserToken) throw new Error("Missing opaque session");
      return { ...account, token: login.browserToken };
    }
    const actor = await user();
    const admin = await user();
    const outsider = await user();
    const actorMembership = randomUUID();
    const adminMembership = randomUUID();
    await owner.household.create({
      data: {
        id: householdId,
        name: "Synthetic accounts household",
        memberships: {
          create: [
            {
              id: actorMembership,
              userId: actor.session.user.id,
              slot: 1,
              role: "MEMBER",
            },
            {
              id: adminMembership,
              userId: admin.session.user.id,
              slot: 2,
              role: "ADMIN",
            },
          ],
        },
      },
    });
    await owner.household.create({
      data: {
        id: otherHouseholdId,
        memberships: {
          create: { userId: outsider.session.user.id, slot: 1, role: "ADMIN" },
        },
      },
    });
    await owner.sessionRegistry.updateMany({
      where: { userId: { in: [actor.session.user.id, admin.session.user.id] } },
      data: { householdId },
    });
    await owner.sessionRegistry.updateMany({
      where: { userId: outsider.session.user.id },
      data: { householdId: otherHouseholdId },
    });
    const [privilege] = await runtime.$queryRaw<
      { rolsuper: boolean; rolbypassrls: boolean; role: string }[]
    >`SELECT current_user AS role, rolsuper, rolbypassrls FROM pg_roles WHERE rolname=current_user`;
    expect(privilege).toEqual({
      role: "joint_app_runtime",
      rolsuper: false,
      rolbypassrls: false,
    });
    const root = `/households/${householdId}/accounts`;
    const input = {
      label: "Private savings",
      kind: "SAVINGS",
      currency: "GBP",
      liquidity: "AVAILABLE",
    };
    expect((await request(root)).status).toBe(401);
    expect((await request(root, outsider.token)).status).toBe(404);
    expect(
      (
        await request(root, actor.token, "POST", input, {
          "Idempotency-Key": randomUUID(),
        })
      ).status,
    ).toBe(403);
    const enroll = await request("/auth/mfa/enroll", actor.token, "POST", {});
    expect(enroll.ok).toBe(true);
    const factor = mfaEnrollmentSchema.parse(await enroll.json());
    expect(
      (
        await request("/auth/mfa/verify", actor.token, "POST", {
          factorId: factor.factorId,
          code: totp(factor.secret),
        })
      ).ok,
    ).toBe(true);
    const key = randomUUID();
    const creation = await request(root, actor.token, "POST", input, {
      "Idempotency-Key": key,
    });
    expect(creation.status).toBe(200);
    expect(creation.headers.get("cache-control")).toContain("no-store");
    let account = accountSchema.parse(await creation.json());
    expect(account).toMatchObject({
      ownership: "OWNED",
      access: "TRANSACTIONS",
      latestValuation: null,
      sharing: { level: "NONE", version: 0 },
      legalOwnerKind: "ADULT",
      source: "MANUAL",
    });
    const accountPath = `${root}/${account.id}`;
    const replay = await request(root, actor.token, "POST", input, {
      "Idempotency-Key": key,
    });
    expect(accountSchema.parse(await replay.json()).id).toBe(account.id);
    expect(
      (
        await request(
          root,
          actor.token,
          "POST",
          { ...input, label: "Different" },
          { "Idempotency-Key": key },
        )
      ).status,
    ).toBe(409);
    expect((await request(accountPath, admin.token)).status).toBe(404);
    expect((await request(accountPath, outsider.token)).status).toBe(404);
    expect(
      (
        await request(
          `/households/${otherHouseholdId}/accounts/${account.id}`,
          outsider.token,
        )
      ).status,
    ).toBe(404);
    expect((await request(`${root}/${randomUUID()}`, actor.token)).status).toBe(
      404,
    );
    const partnerList = accountListSchema.parse(
      await (await request(root, admin.token)).json(),
    );
    expect(partnerList.items).toEqual([]);
    const patched = await request(
      accountPath,
      actor.token,
      "PATCH",
      { label: "Renamed savings", liquidity: "RESTRICTED" },
      { "If-Match": `"${account.version}"` },
    );
    expect(patched.ok).toBe(true);
    account = accountSchema.parse(await patched.json());
    expect(
      (
        await request(
          accountPath,
          actor.token,
          "PATCH",
          { label: "Stale edit", liquidity: "AVAILABLE" },
          { "If-Match": '"1"' },
        )
      ).status,
    ).toBe(409);
    const valuationKey = randomUUID();
    const valuation = {
      money: { amountMinor: "12345", currency: "GBP" },
      asOfDate: "2026-01-01",
    };
    const valueHeaders = {
      "If-Match": `"${account.version}"`,
      "Idempotency-Key": valuationKey,
    };
    const valued = await request(
      `${accountPath}/valuations`,
      actor.token,
      "POST",
      valuation,
      valueHeaders,
    );
    expect(valued.ok).toBe(true);
    account = accountSchema.parse(await valued.json());
    expect(account.latestValuation).toMatchObject(valuation);
    expect(
      (
        await request(
          `${accountPath}/valuations`,
          actor.token,
          "POST",
          valuation,
          valueHeaders,
        )
      ).ok,
    ).toBe(true);
    expect(
      (
        await request(
          `${accountPath}/valuations`,
          actor.token,
          "POST",
          { ...valuation, money: { ...valuation.money, amountMinor: "999" } },
          valueHeaders,
        )
      ).status,
    ).toBe(409);
    const second = await request(
      root,
      actor.token,
      "POST",
      { ...input, label: "Second private account" },
      { "Idempotency-Key": randomUUID() },
    );
    expect(second.ok).toBe(true);
    const secondAccount = accountSchema.parse(await second.json());
    const page = accountListSchema.parse(
      await (await request(`${root}?limit=1`, actor.token)).json(),
    );
    expect(page.nextCursor).not.toBeNull();
    const grantPath = `${accountPath}/grants/${adminMembership}`;
    const grant = await request(
      grantPath,
      actor.token,
      "PUT",
      { level: "TOTALS" },
      { "If-Match": '"0"' },
    );
    expect(grant.ok).toBe(true);
    account = accountSchema.parse(await grant.json());
    expect(
      (
        await request(
          `${root}?limit=1&cursor=${encodeURIComponent(page.nextCursor ?? "")}`,
          actor.token,
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await request(
          grantPath,
          actor.token,
          "PUT",
          { level: "NONE" },
          { "If-Match": '"0"' },
        )
      ).status,
    ).toBe(409);
    const shared = accountSchema.parse(
      await (await request(accountPath, admin.token)).json(),
    );
    expect(shared).toMatchObject({
      ownership: "SHARED",
      access: "TOTALS",
      permissions: { canEdit: false, canValue: false, canShare: false },
    });
    expect(
      (
        await request(
          accountPath,
          admin.token,
          "PATCH",
          { label: "Admin override", liquidity: "AVAILABLE" },
          { "If-Match": `"${account.version}"` },
        )
      ).status,
    ).toBe(404);
    expect(
      (
        await request(
          `${accountPath}/valuations`,
          admin.token,
          "POST",
          valuation,
          {
            "If-Match": `"${account.version}"`,
            "Idempotency-Key": randomUUID(),
          },
        )
      ).status,
    ).toBe(404);
    expect(
      (
        await request(
          `${accountPath}/grants/${actorMembership}`,
          admin.token,
          "PUT",
          { level: "TRANSACTIONS" },
          { "If-Match": '"0"' },
        )
      ).status,
    ).toBe(404);
    const scoped = new ScopedDatabase(runtime);
    async function context(
      userId: string,
      membershipId: string,
    ): Promise<AuthContext> {
      const member = await owner.membership.findUniqueOrThrow({
        where: { id: membershipId },
      });
      const session = await owner.sessionRegistry.findFirstOrThrow({
        where: { userId, kind: "WEB", revokedAt: null },
      });
      return {
        userId,
        membershipId,
        householdId,
        sessionId: session.id,
        grantVersion: member.grantVersion,
        requestId: randomUUID(),
        aal: "aal2",
        mfaAuthenticatedAt: Date.now(),
      };
    }
    const access = new AccountAccessService(scoped);
    const adminContext = await context(admin.session.user.id, adminMembership);
    await access.require(adminContext, [account.id], "TOTALS");
    await expect(
      access.require(adminContext, [account.id], "TRANSACTIONS"),
    ).rejects.toMatchObject({ status: 404 });
    const actorContext = await context(actor.session.user.id, actorMembership);
    const ownedScope = await access.require(
      actorContext,
      [account.id, secondAccount.id],
      "TRANSACTIONS",
    );
    expect(ownedScope).toMatchObject({
      context: actorContext,
      accountIds: [account.id, secondAccount.id],
      level: "TRANSACTIONS",
    });
    await expect(
      access.require(adminContext, [account.id, secondAccount.id], "TOTALS"),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      access.require(actorContext, [], "TOTALS"),
    ).rejects.toMatchObject({ status: 400 });
    const grants = new AccountGrants(scoped);
    const grantVersion = account.sharing?.version ?? 0;
    for (const proof of [null, Date.now() - 301000, Date.now() + 60000])
      await expect(
        grants.set(
          { ...actorContext, mfaAuthenticatedAt: proof },
          account.id,
          adminMembership,
          "TRANSACTIONS",
          grantVersion,
        ),
      ).rejects.toMatchObject({ status: 403 });
    const widened = await request(
      grantPath,
      actor.token,
      "PUT",
      { level: "TRANSACTIONS" },
      { "If-Match": `"${grantVersion}"` },
    );
    expect(widened.ok).toBe(true);
    const widenedAccount = accountSchema.parse(await widened.json());
    const widenedAdminContext = await context(
      admin.session.user.id,
      adminMembership,
    );
    await access.require(widenedAdminContext, [account.id], "TRANSACTIONS");
    const revoked = await request(
      grantPath,
      actor.token,
      "PUT",
      { level: "NONE" },
      { "If-Match": `"${widenedAccount.sharing?.version}"` },
    );
    expect(revoked.ok).toBe(true);
    expect((await request(accountPath, admin.token)).status).toBe(404);
    const currentActorContext = await context(
      actor.session.user.id,
      actorMembership,
    );
    expect(
      (await request("/auth/logout", actor.token, "POST", { scope: "local" }))
        .ok,
    ).toBe(true);
    expect([401, 403]).toContain(
      (await request(accountPath, actor.token)).status,
    );
    await expect(
      access.require(currentActorContext, [account.id], "TOTALS"),
    ).rejects.toBeDefined();
  } finally {
    await app.close();
    await owner.account.deleteMany({
      where: { householdId: { in: [householdId, otherHouseholdId] } },
    });
    await owner.household.deleteMany({
      where: { id: { in: [householdId, otherHouseholdId] } },
    });
    await owner.sessionRegistry.deleteMany({
      where: { userId: { in: users } },
    });
    await owner.requestKey.deleteMany({ where: { userId: { in: users } } });
    await owner.auditEvent.deleteMany({ where: { userId: { in: users } } });
    await owner.user.deleteMany({ where: { id: { in: users } } });
    for (const id of users) await auth.deleteUser(id);
    await Promise.all([
      owner.$disconnect(),
      runtime.$disconnect(),
      health.close(),
    ]);
  }
}, 60000);
