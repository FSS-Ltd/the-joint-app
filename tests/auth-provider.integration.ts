import { randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import {
  createLocalAuthFixture,
  emailCode,
  totp,
} from "./fixtures/local-auth.js";
import { AuthProvider } from "../apps/api/src/modules/identity/auth-provider.js";

it("uses real Auth signup, email confirmation, password recovery, refresh and TOTP", async () => {
  const authUrl = process.env.SUPABASE_AUTH_URL;
  const apiKey = process.env.SUPABASE_PUBLISHABLE_KEY;
  const adminKey = process.env.SUPABASE_TEST_ADMIN_KEY;
  if (!authUrl || !apiKey || !adminKey)
    throw new Error("Local Auth integration requires .env.auth configuration");
  const provider = new AuthProvider(authUrl, apiKey);
  const email = `provider-${randomUUID()}@example.test`;
  const password = `Synthetic-${randomUUID()}-9a!`;
  const changedPassword = `Synthetic-${randomUUID()}-9b!`;
  const mailIds = new Set<string>();
  let userId: string | undefined;
  try {
    await provider.signup(email, password);
    await expect(provider.login(email, password)).rejects.toThrow(
      "Authentication failed",
    );
    const confirmed = await provider.verify(
      email,
      await emailCode(email, mailIds),
      "signup",
    );
    userId = confirmed.user.id;
    expect((await provider.getUser(confirmed.access_token)).email).toBe(email);
    const login = await provider.login(email, password);
    await expect(provider.login(email, "wrong-secret")).rejects.toThrow(
      "Authentication failed",
    );
    const refreshed = await provider.refresh(login.refresh_token);
    expect(refreshed.user.id).toBe(userId);
    await provider.recovery(email);
    const recovery = await provider.verify(
      email,
      await emailCode(email, mailIds),
      "recovery",
    );
    await provider.updatePassword(recovery, changedPassword);
    const changed = await provider.login(email, changedPassword);
    const enrollment = await provider.enroll(changed);
    expect(enrollment.qrCode).toContain("svg");
    await expect(
      provider.factors({ ...changed, access_token: "invalid" }),
    ).rejects.toThrow("Authentication failed");
    const expiredToken = `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({ exp: 1 })).toString("base64url")}.signature`;
    await expect(
      provider.factors({ ...changed, access_token: expiredToken }),
    ).rejects.toThrow("Authentication failed");
    const validCode = totp(enrollment.secret);
    const invalidCode = `${(Number(validCode[0]) + 1) % 10}${validCode.slice(1)}`;
    await expect(
      provider.verifyMfa(changed, enrollment.factorId, invalidCode),
    ).rejects.toThrow("Unable to verify authentication code");
    const elevated = await provider.verifyMfa(
      changed,
      enrollment.factorId,
      totp(enrollment.secret),
    );
    expect(await provider.factors(elevated)).toContainEqual({
      id: enrollment.factorId,
      friendlyName: undefined,
      status: "verified",
    });
    await provider.signOut(elevated.access_token, "global");
    await expect(provider.refresh(elevated.refresh_token)).rejects.toThrow(
      "Authentication failed",
    );
  } finally {
    if (userId) {
      const response = await fetch(`${authUrl}/admin/users/${userId}`, {
        method: "DELETE",
        headers: { apikey: adminKey, Authorization: `Bearer ${adminKey}` },
      });
      expect(response.ok).toBe(true);
    }
  }
}, 30000);

it("creates and deletes disposable confirmed users through the local admin fixture", async () => {
  const fixture = createLocalAuthFixture();
  const user = await fixture.createConfirmedUser();
  try {
    expect(
      (await fixture.provider.getUser(user.session.access_token)).email,
    ).toBe(user.email);
  } finally {
    await fixture.deleteUser(user.session.user.id);
  }
});

it("replaces abandoned TOTP enrollments while preserving verified authenticators", async () => {
  const fixture = createLocalAuthFixture();
  const user = await fixture.createConfirmedUser();
  try {
    const abandoned = await fixture.provider.enroll(user.session);
    const replacement = await fixture.provider.enroll(user.session);
    expect(replacement.factorId).not.toBe(abandoned.factorId);
    expect(await fixture.provider.factors(user.session)).toEqual([
      {
        id: replacement.factorId,
        friendlyName: undefined,
        status: "unverified",
      },
    ]);
    const elevated = await fixture.provider.verifyMfa(
      user.session,
      replacement.factorId,
      totp(replacement.secret),
    );
    await expect(fixture.provider.enroll(elevated)).rejects.toThrow(
      "Authenticator already configured",
    );
    expect(await fixture.provider.factors(elevated)).toEqual([
      { id: replacement.factorId, friendlyName: undefined, status: "verified" },
    ]);
  } finally {
    await fixture.deleteUser(user.session.user.id);
  }
});
