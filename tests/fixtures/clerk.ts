import { randomBytes, randomUUID } from "node:crypto";
import { exportSPKI, generateKeyPair, SignJWT } from "jose";
import type { ClerkServerEnvironment } from "../../packages/contracts/src/clerk.js";
import {
  ClerkProviderUnavailable,
  type ClerkGateway,
  type ClerkSessionState,
  type ClerkUserState,
} from "../../apps/api/src/modules/identity/clerk/provider-gateway.js";

export async function createClerkFixture() {
  const keys = await generateKeyPair("RS256");
  const issuer = `https://fixture${randomUUID().replaceAll("-", "")}.clerk.accounts.dev`;
  const environment: ClerkServerEnvironment & {
    AUTH_TOKEN_KEY: string;
    AUTH_EMAIL_HASH_KEY: string;
  } = {
    CLERK_ISSUER: issuer,
    CLERK_JWT_KEY: await exportSPKI(keys.publicKey),
    CLERK_SECRET_KEY: "sk_test_synthetic_fixture_only_do_not_use",
    CLERK_AUTHORIZED_PARTIES: ["http://127.0.0.1:3000"],
    CLERK_TIMEOUT_MS: 1000,
    AUTH_TOKEN_KEY: randomBytes(32).toString("base64"),
    AUTH_EMAIL_HASH_KEY: randomBytes(32).toString("base64"),
  };
  const users = new Map<string, ClerkUserState>();
  const sessions = new Map<string, ClerkSessionState>();
  let unavailable = false;
  const gateway: ClerkGateway = {
    async user(id) {
      if (unavailable) throw new ClerkProviderUnavailable();
      const user = users.get(id);
      if (!user) throw new ClerkProviderUnavailable();
      return user;
    },
    async session(id) {
      if (unavailable) throw new ClerkProviderUnavailable();
      const session = sessions.get(id);
      if (!session) throw new ClerkProviderUnavailable();
      return session;
    },
  };
  function account(mfa = false) {
    const userId = "user_" + randomUUID().replaceAll("-", ""),
      sessionId = "sess_" + randomUUID().replaceAll("-", "");
    users.set(userId, {
      id: userId,
      email: randomUUID() + "@example.test",
      emailVerified: true,
      blocked: false,
      totpEnabled: mfa,
      mfaEnabled: mfa,
      otherSecondFactorsEnabled: false,
    });
    sessions.set(sessionId, {
      id: sessionId,
      userId,
      status: "active",
      expiresAt: Date.now() + 3_600_000,
      createdAt: Date.now() - 120_000,
      hasPendingTask: false,
      impersonating: false,
    });
    return { userId, sessionId };
  }
  async function token(
    userId: string,
    sessionId: string,
    overrides: Record<string, unknown> = {},
  ) {
    const now = Math.floor(Date.now() / 1000);
    return new SignJWT({
      v: 2,
      sub: userId,
      sid: sessionId,
      iss: issuer,
      azp: environment.CLERK_AUTHORIZED_PARTIES[0],
      iat: now,
      nbf: now - 1,
      exp: now + 120,
      fva: [0, users.get(userId)?.mfaEnabled ? 0 : -1],
      ...overrides,
    })
      .setProtectedHeader({ alg: "RS256", typ: "JWT" })
      .sign(keys.privateKey);
  }
  return {
    environment,
    gateway,
    users,
    sessions,
    account,
    token,
    setUnavailable(value: boolean) {
      unavailable = value;
    },
  };
}
