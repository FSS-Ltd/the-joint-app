import { randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import {
  authResultSchema,
  authServerEnvironmentSchema,
  householdSummarySchema,
  invitationCreatedSchema,
  meResponseSchema,
  mfaEnrollmentSchema,
} from "../packages/contracts/dist/index.js";
import { createDatabase } from "../packages/database/dist/index.js";
import { createOrm } from "../packages/database/dist/client.js";
import { createApplication } from "../apps/api/dist/application.js";
import {
  createLocalAuthFixture,
  emailCode,
  totp,
} from "./fixtures/local-auth.js";

type LocalUser = Awaited<
  ReturnType<ReturnType<typeof createLocalAuthFixture>["createConfirmedUser"]>
>;

async function withIdentityApi(
  run: (context: {
    user(): Promise<LocalUser>;
    request(
      path: string,
      body?: unknown,
      token?: string,
      key?: string,
    ): Promise<Response>;
    household(id: string): void;
  }) => Promise<void>,
): Promise<void> {
  const connectionString =
    process.env.DATABASE_URL ??
    "postgresql://joint:local-development-only@127.0.0.1:5432/joint";
  const database = createOrm(connectionString);
  const health = createDatabase(connectionString, 500);
  const auth = createLocalAuthFixture();
  const users: string[] = [];
  const households: string[] = [];
  const app = await createApplication(health, undefined, {
    database,
    environment: authServerEnvironmentSchema.parse(process.env),
  });
  try {
    await app.listen(0, "127.0.0.1");
    const baseUrl = await app.getUrl();
    await run({
      async user() {
        const user = await auth.createConfirmedUser();
        users.push(user.session.user.id);
        return user;
      },
      async request(path, body, token, key) {
        return fetch(`${baseUrl}/v1${path}`, {
          method: body === undefined ? "GET" : "POST",
          headers: {
            ...(body === undefined
              ? {}
              : { "Content-Type": "application/json" }),
            ...(token ? { Authorization: `Session ${token}` } : {}),
            ...(key ? { "Idempotency-Key": key } : {}),
          },
          ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        });
      },
      household(id) {
        households.push(id);
      },
    });
  } finally {
    await app.close();
    await database.household.deleteMany({ where: { id: { in: households } } });
    await database.sessionRegistry.deleteMany({
      where: { userId: { in: users } },
    });
    await database.requestKey.deleteMany({ where: { userId: { in: users } } });
    await database.auditEvent.deleteMany({ where: { userId: { in: users } } });
    await database.user.deleteMany({ where: { id: { in: users } } });
    for (const id of users) await auth.deleteUser(id);
    await database.$disconnect();
    await health.close();
  }
}

async function browserToken(
  response: Response,
  expectedState = "AUTHENTICATED",
): Promise<string> {
  expect(response.ok).toBe(true);
  const result = authResultSchema.parse(await response.json());
  expect(result.state).toBe(expectedState);
  if (!result.browserToken)
    throw new Error("Expected an opaque browser session");
  return result.browserToken;
}

it("supports individual identity, household invitations, MFA challenges and opaque session revocation", async () => {
  await withIdentityApi(async ({ user, request, household }) => {
    const owner = await user();
    const member = await user();
    const outsider = await user();
    const login = (account: LocalUser) =>
      request("/auth/login", {
        email: account.email,
        password: account.password,
      });
    const ownerToken = await browserToken(await login(owner));
    const otherOwnerToken = await browserToken(await login(owner));
    const memberToken = await browserToken(await login(member));
    const outsiderToken = await browserToken(await login(outsider));
    expect((await request("/me")).status).toBe(401);
    const individual = await request("/me", undefined, ownerToken);
    expect(individual.headers.get("cache-control")).toContain("no-store");
    const me = meResponseSchema.parse(await individual.json());
    expect(me.user.id).toBe(owner.session.user.id);
    expect(me.membership).toBeNull();
    const created = await request(
      "/households",
      { name: "Synthetic household" },
      ownerToken,
      randomUUID(),
    );
    expect(created.ok).toBe(true);
    const summary = householdSummarySchema.parse(await created.json());
    household(summary.id);
    expect(summary).toMatchObject({
      baseCurrency: "GBP",
      timezone: "Europe/London",
    });
    const invite = await request(
      `/households/${summary.id}/invitations`,
      { email: member.email },
      ownerToken,
      randomUUID(),
    );
    expect(invite.ok).toBe(true);
    const invitation = invitationCreatedSchema.parse(await invite.json());
    expect(
      (
        await request(
          "/invitations/accept",
          { token: invitation.token },
          outsiderToken,
          randomUUID(),
        )
      ).status,
    ).toBe(404);
    const acceptKey = randomUUID();
    const accepted = await request(
      "/invitations/accept",
      { token: invitation.token },
      memberToken,
      acceptKey,
    );
    expect(accepted.ok).toBe(true);
    const replay = await request(
      "/invitations/accept",
      { token: invitation.token },
      memberToken,
      acceptKey,
    );
    expect(replay.status).toBe(404);
    expect(
      (
        await request(
          "/invitations/accept",
          { token: invitation.token },
          memberToken,
          randomUUID(),
        )
      ).ok,
    ).toBe(false);
    const memberMe = meResponseSchema.parse(
      await (await request("/me", undefined, memberToken)).json(),
    );
    expect(memberMe.membership).toMatchObject({
      role: "MEMBER",
      householdId: summary.id,
      household: { memberCount: 2 },
    });
    const enrollmentResponse = await request(
      "/auth/mfa/enroll",
      {},
      ownerToken,
    );
    expect(enrollmentResponse.ok).toBe(true);
    const enrollment = mfaEnrollmentSchema.parse(
      await enrollmentResponse.json(),
    );
    expect(
      (
        await request(
          "/auth/mfa/verify",
          { factorId: enrollment.factorId, code: totp(enrollment.secret) },
          ownerToken,
        )
      ).ok,
    ).toBe(true);
    const challenge = await browserToken(await login(owner), "MFA_REQUIRED");
    const challengeMe = meResponseSchema.parse(
      await (await request("/me", undefined, challenge)).json(),
    );
    expect(challengeMe.session).toMatchObject({ aal: "aal1", needsMfa: true });
    expect(
      (
        await request(
          `/households/${summary.id}/invitations`,
          { email: outsider.email },
          challenge,
          randomUUID(),
        )
      ).status,
    ).toBe(403);
    expect(
      (await request("/auth/logout", { scope: "local" }, challenge)).ok,
    ).toBe(true);
    expect((await request("/me", undefined, challenge)).status).toBe(401);
    // An already revoked cookie must not authorise revoking newer sessions.
    expect(
      (await request("/auth/logout", { scope: "global" }, challenge)).ok,
    ).toBe(true);
    expect((await request("/me", undefined, ownerToken)).ok).toBe(true);
    expect(
      (await request("/auth/logout", { scope: "global" }, ownerToken)).ok,
    ).toBe(true);
    expect((await request("/me", undefined, ownerToken)).status).toBe(401);
    expect((await request("/me", undefined, otherOwnerToken)).status).toBe(401);
    expect((await request("/me", undefined, memberToken)).ok).toBe(true);
  });
}, 60000);

it("restricts recovery sessions until password reset and revokes other sessions", async () => {
  await withIdentityApi(async ({ user, request, household }) => {
    const account = await user();
    const oldToken = await browserToken(
      await request("/auth/login", {
        email: account.email,
        password: account.password,
      }),
    );
    const recoveryResponse = await request("/auth/recovery", {
      email: account.email,
    });
    expect(recoveryResponse.ok).toBe(true);
    const recoveryToken = await browserToken(
      await request("/auth/verify", {
        email: account.email,
        code: await emailCode(account.email, new Set()),
        type: "recovery",
      }),
      "PASSWORD_RESET_REQUIRED",
    );
    expect(
      (
        await request(
          "/households",
          { name: "Must not be created" },
          recoveryToken,
          randomUUID(),
        )
      ).status,
    ).toBe(403);
    const before = meResponseSchema.parse(
      await (await request("/me", undefined, recoveryToken)).json(),
    );
    expect(before.session.purpose).toBe("RECOVERY");
    const password = `Changed-${randomUUID()}-9z!`;
    const reset = await request("/auth/password", { password }, recoveryToken);
    expect(reset.ok).toBe(true);
    expect(authResultSchema.parse(await reset.json()).state).toBe(
      "AUTHENTICATED",
    );
    expect((await request("/me", undefined, oldToken)).status).toBe(401);
    const after = meResponseSchema.parse(
      await (await request("/me", undefined, recoveryToken)).json(),
    );
    expect(after.session.purpose).toBe("NORMAL");
    expect(
      (
        await request("/auth/login", {
          email: account.email,
          password: account.password,
        })
      ).status,
    ).toBe(401);
    await browserToken(
      await request("/auth/login", { email: account.email, password }),
    );
    const created = await request(
      "/households",
      { name: "Recovered household" },
      recoveryToken,
      randomUUID(),
    );
    expect(created.ok).toBe(true);
    household(householdSummarySchema.parse(await created.json()).id);
  });
}, 60000);

it("requires an enrolled authenticator before a recovery session can change its password", async () => {
  await withIdentityApi(async ({ user, request }) => {
    const account = await user();
    const oldToken = await browserToken(
      await request("/auth/login", {
        email: account.email,
        password: account.password,
      }),
    );
    const enrollment = mfaEnrollmentSchema.parse(
      await (await request("/auth/mfa/enroll", {}, oldToken)).json(),
    );
    expect(
      (
        await request(
          "/auth/mfa/verify",
          { factorId: enrollment.factorId, code: totp(enrollment.secret) },
          oldToken,
        )
      ).status,
    ).toBe(200);
    expect(
      (await request("/auth/recovery", { email: account.email })).status,
    ).toBe(200);
    const recoveryToken = await browserToken(
      await request("/auth/verify", {
        email: account.email,
        code: await emailCode(account.email, new Set()),
        type: "recovery",
      }),
      "MFA_REQUIRED",
    );
    const password = `Changed-${randomUUID()}-7y!`;
    expect(
      (await request("/auth/password", { password }, recoveryToken)).status,
    ).toBe(403);
    const before = meResponseSchema.parse(
      await (await request("/me", undefined, recoveryToken)).json(),
    );
    expect(before.session).toMatchObject({
      purpose: "RECOVERY",
      aal: "aal1",
      needsMfa: true,
    });
    // Supabase rejects reuse of the enrollment period's TOTP code.
    await new Promise((resolve) =>
      setTimeout(resolve, 30000 - (Date.now() % 30000) + 150),
    );
    const proof = await request(
      "/auth/mfa/verify",
      { factorId: enrollment.factorId, code: totp(enrollment.secret) },
      recoveryToken,
    );
    expect(proof.status).toBe(200);
    expect(authResultSchema.parse(await proof.json()).state).toBe(
      "PASSWORD_RESET_REQUIRED",
    );
    expect(
      (await request("/auth/password", { password }, recoveryToken)).status,
    ).toBe(200);
    expect((await request("/me", undefined, oldToken)).status).toBe(401);
    const after = meResponseSchema.parse(
      await (await request("/me", undefined, recoveryToken)).json(),
    );
    expect(after.session).toMatchObject({
      purpose: "NORMAL",
      aal: "aal2",
      needsMfa: false,
    });
  });
}, 60000);
