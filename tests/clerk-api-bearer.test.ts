import { afterEach, beforeAll, expect, it, vi } from "vitest";
import { decodeJwt, SignJWT } from "jose";
import { createClerkFixture } from "./fixtures/clerk.js";
import { ClerkCredentialVerifier } from "../apps/api/src/modules/identity/clerk/credential-verifier.js";

const audience = "urn:joint:test-api";
let fixture: Awaited<ReturnType<typeof createClerkFixture>>;
beforeAll(async () => {
  fixture = await createClerkFixture();
});
afterEach(() => vi.restoreAllMocks());

function session(configured = true) {
  const account = fixture.account(true);
  const verifier = new ClerkCredentialVerifier(
    {
      ...fixture.environment,
      ...(configured ? { CLERK_API_BEARER_AUDIENCE: audience } : {}),
    },
    fixture.gateway,
  );
  const token = (overrides: Record<string, unknown> = {}) =>
    fixture.token(account.userId, account.sessionId, {
      azp: undefined,
      aud: audience,
      joint_token_use: "api-session-v1",
      ...overrides,
    });
  return { account, verifier, token };
}

it("accepts the configured API-purpose session without changing provider identity or MFA proof", async () => {
  const { account, verifier, token } = session();
  const credential = await verifier.verify(await token());
  expect(credential).toMatchObject({
    issuer: fixture.environment.CLERK_ISSUER,
    subject: account.userId,
    sessionId: account.sessionId,
    mfaEnrolled: true,
    totpEnrolled: true,
  });
  expect(credential.mfaAuthenticatedAt).toBeLessThanOrEqual(
    Date.now() - 60_000,
  );
  expect(credential).not.toHaveProperty("aud");
  expect(credential).not.toHaveProperty("joint_token_use");
  const claims = await verifier.verifyClaims(await token());
  expect(claims).not.toHaveProperty("aud");
  expect(claims).not.toHaveProperty("joint_token_use");
});

it("does not enable the API profile merely because its claims are signed", async () => {
  const { verifier, token } = session(false);
  const provider = vi.spyOn(fixture.gateway, "session");
  await expect(verifier.verify(await token())).rejects.toMatchObject({
    status: 401,
  });
  expect(provider).not.toHaveBeenCalled();
});

it.each([
  { aud: undefined },
  { aud: "" },
  { aud: "urn:joint:other-api" },
  { aud: [audience] },
  { aud: { value: audience } },
  { aud: null },
  { aud: 42 },
  { joint_token_use: undefined },
  { joint_token_use: "native" },
  { joint_token_use: ["api-session-v1"] },
  { azp: "https://foreign.example.test" },
  { azp: "" },
  { azp: null },
  { azp: 42 },
  { azp: ["http://127.0.0.1:3000"] },
  { iss: "https://foreign.clerk.accounts.dev" },
  { exp: 1 },
  { iat: 4_000_000_000 },
  { nbf: 4_000_000_000 },
  { sid: "m2m_synthetic" },
  { sub: "api_key_synthetic" },
  { v: 1 },
  { sts: "pending" },
  { act: { sub: "user_impersonator" } },
  { fva: [0, -2] },
])(
  "rejects unsuitable API-purpose claims before provider lookup: %j",
  async (overrides) => {
    const { verifier, token } = session();
    const providerSession = vi.spyOn(fixture.gateway, "session");
    const providerUser = vi.spyOn(fixture.gateway, "user");
    await expect(verifier.verify(await token(overrides))).rejects.toMatchObject(
      { status: 401 },
    );
    expect(providerSession).not.toHaveBeenCalled();
    expect(providerUser).not.toHaveBeenCalled();
  },
);

it("preserves the allowed web-origin path independently of API-purpose claims", async () => {
  const { account, verifier, token } = session();
  await expect(
    verifier.verify(
      await token({
        azp: "http://127.0.0.1:3000",
        aud: undefined,
        joint_token_use: undefined,
      }),
    ),
  ).resolves.toMatchObject({
    subject: account.userId,
    sessionId: account.sessionId,
  });
});

it("keeps claims-only verification available without granting access during provider outage", async () => {
  const { account, verifier, token } = session();
  const signed = await token();
  fixture.setUnavailable(true);
  try {
    await expect(verifier.verifyClaims(signed)).resolves.toMatchObject({
      sub: account.userId,
      sid: account.sessionId,
    });
    await expect(verifier.verify(signed)).rejects.toMatchObject({
      status: 503,
    });
  } finally {
    fixture.setUnavailable(false);
  }
});

it("does not accept a tampered API-purpose token before provider lookup", async () => {
  const { verifier, token } = session();
  const signed = await token();
  const [header, payload] = signed.split(".");
  const provider = vi.spyOn(fixture.gateway, "session");
  await expect(
    verifier.verify(`${header}.${payload}.AAAAAAAA`),
  ).rejects.toMatchObject({ status: 401 });
  expect(provider).not.toHaveBeenCalled();
});

it("rejects unsigned and HMAC-signed API-purpose tokens", async () => {
  const { verifier, token } = session();
  const signed = await token();
  const [, payload] = signed.split(".");
  const unsignedHeader = Buffer.from('{"alg":"none"}').toString("base64url");
  const hmac = await new SignJWT(decodeJwt(signed))
    .setProtectedHeader({ alg: "HS256" })
    .sign(new Uint8Array(32));
  const provider = vi.spyOn(fixture.gateway, "session");
  for (const invalid of [`${unsignedHeader}.${payload}.`, hmac]) {
    await expect(verifier.verify(invalid)).rejects.toMatchObject({
      status: 401,
    });
  }
  expect(provider).not.toHaveBeenCalled();
});

it.each([
  { status: "revoked" },
  { status: "pending" },
  { userId: "user_other" },
  { hasPendingTask: true },
  { impersonating: true },
  { expiresAt: 1 },
])(
  "keeps authoritative session rejection for API-purpose tokens: %j",
  async (override) => {
    const { account, verifier, token } = session();
    const state = fixture.sessions.get(account.sessionId);
    if (!state) throw new Error("Missing synthetic session");
    fixture.sessions.set(account.sessionId, { ...state, ...override });
    await expect(verifier.verify(await token())).rejects.toMatchObject({
      status: 401,
    });
  },
);

it.each([{ blocked: true }, { emailVerified: false }, { id: "user_other" }])(
  "keeps authoritative user rejection for API-purpose tokens: %j",
  async (override) => {
    const { account, verifier, token } = session();
    const state = fixture.users.get(account.userId);
    if (!state) throw new Error("Missing synthetic user");
    fixture.users.set(account.userId, { ...state, ...override });
    await expect(verifier.verify(await token())).rejects.toMatchObject({
      status: 401,
    });
  },
);

it.each([{ fva: undefined }, { fva: [0, -1] }])(
  "does not infer MFA proof from API purpose when factor evidence is missing: %j",
  async (override) => {
    const { verifier, token } = session();
    const credential = await verifier.verify(await token(override));
    expect(credential.mfaAuthenticatedAt).toBeNull();
  },
);
