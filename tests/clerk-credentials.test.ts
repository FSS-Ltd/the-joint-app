import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { exportSPKI, generateKeyPair, SignJWT } from "jose";
import {
  clerkServerEnvironmentSchema,
  clerkWebEnvironmentSchema,
  clerkWebhookEnvironmentSchema,
} from "../packages/contracts/src/clerk.js";
import { readEnvironment } from "../packages/contracts/src/index.js";
import {
  ClerkCredentialVerifier,
  type ClerkGateway,
} from "../apps/api/src/modules/identity/clerk/credential-verifier.js";
import {
  createClerkGateway,
  ClerkProviderNotFound,
  ClerkProviderUnavailable,
} from "../apps/api/src/modules/identity/clerk/provider-gateway.js";

const issuer = "https://synthetic.clerk.accounts.dev";
const origin = "http://127.0.0.1:3000";
const settings = {
  CLERK_ISSUER: issuer,
  CLERK_SECRET_KEY: "sk_test_synthetic_local_fixture_only",
  CLERK_AUTHORIZED_PARTIES: origin,
  CLERK_TIMEOUT_MS: "100",
};
let keys: Awaited<ReturnType<typeof generateKeyPair>>, publicKey: string;
beforeAll(async () => {
  keys = await generateKeyPair("RS256");
  publicKey = await exportSPKI(keys.publicKey);
});
function gateway(): ClerkGateway {
  return {
    session: vi.fn(async () => ({
      id: "sess_synthetic123",
      userId: "user_synthetic123",
      status: "active",
      expiresAt: Date.now() + 3_600_000,
      createdAt: Date.now() - 120_000,
      hasPendingTask: false,
      impersonating: false,
    })),
    user: vi.fn(async () => ({
      id: "user_synthetic123",
      email: "fixture@example.test",
      emailVerified: true,
      blocked: false,
      totpEnabled: true,
      mfaEnabled: true,
      otherSecondFactorsEnabled: false,
    })),
  };
}
function verifier(provider = gateway()): ClerkCredentialVerifier {
  return new ClerkCredentialVerifier(
    clerkServerEnvironmentSchema.parse({
      ...settings,
      CLERK_JWT_KEY: publicKey,
    }),
    provider,
    publicKey,
  );
}
async function token(overrides: Record<string, unknown> = {}): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({
    v: 2,
    sub: "user_synthetic123",
    sid: "sess_synthetic123",
    iss: issuer,
    azp: origin,
    iat: now,
    nbf: now - 1,
    exp: now + 60,
    fva: [0, 0],
    ...overrides,
  })
    .setProtectedHeader({ alg: "RS256", kid: "synthetic" })
    .sign(keys.privateKey);
}

describe("Clerk environment boundary", () => {
  it("requires explicit origins and keeps invalid secret values out of errors", () => {
    expect(() =>
      readEnvironment(clerkServerEnvironmentSchema, {
        ...settings,
        CLERK_JWT_KEY: publicKey,
        CLERK_SECRET_KEY: "NEVER_PRINT_THIS_SECRET",
        CLERK_AUTHORIZED_PARTIES: "*",
      }),
    ).toThrow(
      "Invalid environment fields: CLERK_SECRET_KEY, CLERK_AUTHORIZED_PARTIES.0",
    );
    expect(
      clerkServerEnvironmentSchema.parse({
        ...settings,
        CLERK_JWT_KEY: publicKey,
      }).CLERK_AUTHORIZED_PARTIES,
    ).toEqual([origin]);
  });
  it.each([
    "https://u:p@example.test",
    "https://example.test/path",
    "http://example.test",
    "https://example.test?key=secret",
  ])("rejects unsafe issuer %s", (value) => {
    expect(
      clerkServerEnvironmentSchema.safeParse({
        ...settings,
        CLERK_ISSUER: value,
      }).success,
    ).toBe(false);
  });
  it("requires a development publishable key bound to the configured issuer", () => {
    const key =
      "pk_test_" +
      Buffer.from("synthetic.clerk.accounts.dev$").toString("base64");
    expect(
      clerkWebEnvironmentSchema.safeParse({
        CLERK_ISSUER: issuer,
        NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: key,
      }).success,
    ).toBe(true);
    expect(
      clerkWebEnvironmentSchema.safeParse({
        CLERK_ISSUER: "https://other.clerk.accounts.dev",
        NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: key,
      }).success,
    ).toBe(false);
    expect(
      clerkWebEnvironmentSchema.safeParse({
        CLERK_ISSUER: issuer,
        NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: settings.CLERK_SECRET_KEY,
      }).success,
    ).toBe(false);
    expect(
      clerkWebhookEnvironmentSchema.safeParse({
        CLERK_WEBHOOK_SIGNING_SECRET:
          "whsec_" + Buffer.alloc(32, 1).toString("base64"),
      }).success,
    ).toBe(true);
    expect(
      clerkWebhookEnvironmentSchema.safeParse({
        CLERK_WEBHOOK_SIGNING_SECRET: "not-a-signing-secret",
      }).success,
    ).toBe(false);
  });
});

it("uses signed external identity and conservative MFA time without inventing an internal UUID", async () => {
  const credential = await verifier().verify(await token());
  expect(credential.subject).toBe("user_synthetic123");
  expect(credential.sessionId).toBe("sess_synthetic123");
  expect(credential.email).toBe("fixture@example.test");
  expect(credential.issuer).toBe(issuer);
  expect(credential.mfaEnrolled).toBe(true);
  expect(credential.mfaAuthenticatedAt).toBeLessThanOrEqual(
    Date.now() - 60_000,
  );
  expect(credential.mfaAuthenticatedAt).toBeGreaterThan(Date.now() - 62_000);
  expect(credential).not.toHaveProperty("userId");
});
it.each([
  { iss: "https://other.clerk.accounts.dev" },
  { azp: "https://attacker.example.test" },
  { azp: undefined },
  { exp: 1 },
  { iat: Math.floor(Date.now() / 1000) + 60 },
  { sid: "m2m_synthetic" },
  { sub: "api_key_synthetic" },
  { v: 1 },
  { sts: "pending" },
  { act: { sub: "user_impersonator" } },
])("rejects invalid or unsuitable signed claims: %j", async (claims) => {
  const provider = gateway();
  await expect(
    verifier(provider).verify(await token(claims)),
  ).rejects.toMatchObject({ status: 401 });
  expect(provider.session).not.toHaveBeenCalled();
});
it("rejects malformed and incorrectly signed tokens before contacting provider", async () => {
  const provider = gateway();
  await expect(verifier(provider).verify("not.a.token")).rejects.toMatchObject({
    status: 401,
  });
  const signed = await token();
  const parts = signed.split(".");
  await expect(
    verifier(provider).verify(`${parts[0]}.${parts[1]}.AAAAAAAA`),
  ).rejects.toMatchObject({ status: 401 });
  expect(provider.user).not.toHaveBeenCalled();
});
it.each(["revoked", "ended", "pending"])(
  "rejects authoritative %s session",
  async (status) => {
    const provider = gateway();
    const original = await provider.session(
      "sess_synthetic123",
      new AbortController().signal,
    );
    provider.session = vi.fn(async () => ({ ...original, status }));
    await expect(
      verifier(provider).verify(await token()),
    ).rejects.toMatchObject({ status: 401 });
  },
);
it("rejects session subject substitution and pending tasks", async () => {
  for (const override of [
    { userId: "user_other" },
    { hasPendingTask: true },
    { expiresAt: 1 },
  ]) {
    const provider = gateway();
    const original = await provider.session(
      "sess_synthetic123",
      new AbortController().signal,
    );
    provider.session = vi.fn(async () => ({ ...original, ...override }));
    await expect(
      verifier(provider).verify(await token()),
    ).rejects.toMatchObject({ status: 401 });
  }
});
it.each([
  { emailVerified: false },
  { blocked: true },
  { id: "user_other" },
  { email: "" },
])("rejects unavailable user state %j", async (override) => {
  const provider = gateway();
  const original = await provider.user(
    "user_synthetic123",
    new AbortController().signal,
  );
  provider.user = vi.fn(async () => ({ ...original, ...override }));
  await expect(verifier(provider).verify(await token())).rejects.toMatchObject({
    status: 401,
  });
});
it("never treats email/device trust or absent factor evidence as MFA", async () => {
  const provider = gateway();
  const original = await provider.user(
    "user_synthetic123",
    new AbortController().signal,
  );
  provider.user = vi.fn(async () => ({
    ...original,
    totpEnabled: false,
    mfaEnabled: false,
  }));
  expect(
    (await verifier(provider).verify(await token())).mfaAuthenticatedAt,
  ).toBeNull();
  expect(
    (await verifier().verify(await token({ fva: [0, -1] }))).mfaAuthenticatedAt,
  ).toBeNull();
  expect(
    (await verifier().verify(await token({ fva: undefined })))
      .mfaAuthenticatedAt,
  ).toBeNull();
});
it("token refresh cannot make a stale factor fresh and minute rounding does not extend five minutes", async () => {
  const credential = await verifier().verify(await token({ fva: [0, 5] }));
  expect(credential.mfaAuthenticatedAt).toBeLessThanOrEqual(
    Date.now() - 360_000,
  );
});
it("does not attribute alternative second-factor proof to TOTP", async () => {
  const provider = gateway();
  const original = await provider.user(
    "user_synthetic123",
    new AbortController().signal,
  );
  provider.user = vi.fn(async () => ({
    ...original,
    otherSecondFactorsEnabled: true,
  }));
  expect(
    (await verifier(provider).verify(await token())).mfaAuthenticatedAt,
  ).toBeNull();
});
it("bounds an unresponsive provider and returns a safe error", async () => {
  const provider = gateway();
  provider.session = vi.fn(() => new Promise<never>(() => {}));
  const start = Date.now();
  await expect(verifier(provider).verify(await token())).rejects.toMatchObject({
    status: 503,
    message: "Authentication unavailable",
  });
  expect(Date.now() - start).toBeLessThan(1000);
});
it("distinguishes provider not-found from outage without exposing error details", async () => {
  for (const status of [404, 500]) {
    const provider = gateway();
    provider.user = vi.fn(async () => {
      throw status === 404
        ? new ClerkProviderNotFound("PRIVATE_PROVIDER_SENTINEL")
        : new ClerkProviderUnavailable("PRIVATE_PROVIDER_SENTINEL");
    });
    await expect(
      verifier(provider).verify(await token()),
    ).rejects.toMatchObject({ status: status === 404 ? 401 : 503 });
  }
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
it("rejects a token that expires while authoritative checks run", async () => {
  vi.useFakeTimers();
  const now = Date.now();
  const signed = await token({ exp: Math.floor(now / 1000) + 1 });
  const provider = gateway();
  const user = await provider.user(
    "user_synthetic123",
    new AbortController().signal,
  );
  provider.user = vi.fn(async () => {
    vi.setSystemTime(now + 2000);
    return user;
  });
  await expect(verifier(provider).verify(signed)).rejects.toMatchObject({
    status: 401,
  });
});
it("projects bounded provider responses using a fixed origin and abort signal", async () => {
  const fetcher = vi.fn(async () =>
    Response.json({
      id: "sess_synthetic123",
      user_id: "user_synthetic123",
      status: "active",
      expire_at: Date.now() + 60000,
      created_at: Date.now() - 120000,
      actor: null,
      private_profile: "DISCARDED_SENTINEL",
    }),
  );
  vi.stubGlobal("fetch", fetcher);
  const signal = new AbortController().signal;
  const provider = createClerkGateway(
    clerkServerEnvironmentSchema.parse({
      ...settings,
      CLERK_JWT_KEY: publicKey,
    }),
  );
  const state = await provider.session("sess_synthetic123", signal);
  expect(state).not.toHaveProperty("private_profile");
  expect(fetcher).toHaveBeenCalledWith(
    "https://api.clerk.com/v1/sessions/sess_synthetic123",
    expect.objectContaining({ signal, redirect: "error", cache: "no-store" }),
  );
});
it("rejects oversized and malformed provider bodies", async () => {
  const provider = createClerkGateway(
    clerkServerEnvironmentSchema.parse({
      ...settings,
      CLERK_JWT_KEY: publicKey,
    }),
  );
  for (const body of ["x".repeat(65537), "{}", "not json"]) {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(body)),
    );
    await expect(
      provider.session("sess_synthetic123", new AbortController().signal),
    ).rejects.toThrow();
  }
});

it("rejects unusable configured verification keys with a safe configuration error", () => {
  const invalid =
    "-----BEGIN PUBLIC KEY-----\n" +
    "A".repeat(128) +
    "\n-----END PUBLIC KEY-----";
  expect(
    () =>
      new ClerkCredentialVerifier(
        clerkServerEnvironmentSchema.parse({
          ...settings,
          CLERK_JWT_KEY: invalid,
        }),
        gateway(),
      ),
  ).toThrow("Invalid environment fields: CLERK_JWT_KEY");
});
it("does not ignore an enrolled second factor when TOTP is absent", async () => {
  const provider = gateway();
  const original = await provider.user(
    "user_synthetic123",
    new AbortController().signal,
  );
  provider.user = vi.fn(async () => ({
    ...original,
    mfaEnabled: true,
    totpEnabled: false,
    otherSecondFactorsEnabled: true,
  }));
  const verified = await verifier(provider).verify(await token());
  expect(verified.mfaEnrolled).toBe(true);
  expect(verified.mfaAuthenticatedAt).toBeNull();
});
