import { expect, it, vi } from "vitest";
import { ClerkLegacyLinker } from "../apps/api/src/modules/identity/clerk/legacy-linker.js";
import { createClerkFixture } from "./fixtures/clerk.js";
import { ClerkCredentialVerifier } from "../apps/api/src/modules/identity/clerk/credential-verifier.js";

it("binds only after current Clerk TOTP and a separately verified fresh legacy session", async () => {
  const fixture = await createClerkFixture(),
    account = fixture.account(true);
  const credential = await new ClerkCredentialVerifier(
    fixture.environment,
    fixture.gateway,
  ).verify(await fixture.token(account.userId, account.sessionId));
  const legacy = {
    userId: "legacy",
    sessionId: "session",
    emailHash: "hash",
    aal: "aal2" as const,
    authenticatedAt: Date.now() - 1000,
    mfaAuthenticatedAt: Date.now() - 1000,
  };
  const events: string[] = [];
  const bindLegacy = vi.fn(async () => {
    events.push("bind");
  });
  const linker = new ClerkLegacyLinker(
    {
      verify: async () => {
        events.push("clerk");
        return credential;
      },
    },
    {
      verify: async () => {
        events.push("totp");
        return true;
      },
    },
    {
      withSession: async (_token, apply) => {
        events.push("legacy-open");
        const value = await apply({ principal: legacy });
        events.push("legacy-closed");
        return value;
      },
    },
    {
      bindLegacy,
      recordTotp: async () => {
        events.push("record");
      },
    },
  );
  await expect(
    linker.link("clerk-token", "legacy-token", "123456"),
  ).resolves.toEqual({ state: "AUTHENTICATED" });
  expect(events).toEqual([
    "clerk",
    "totp",
    "clerk",
    "legacy-open",
    "legacy-closed",
    "bind",
    "record",
  ]);
  expect(bindLegacy).toHaveBeenCalledWith(
    legacy,
    expect.objectContaining({
      subject: account.userId,
      mfaAuthenticatedAt: expect.any(Number),
    }),
  );
});
it("does not bind when TOTP is rejected", async () => {
  const fixture = await createClerkFixture(),
    account = fixture.account(true);
  const credential = await new ClerkCredentialVerifier(
    fixture.environment,
    fixture.gateway,
  ).verify(await fixture.token(account.userId, account.sessionId));
  const bindLegacy = vi.fn();
  const linker = new ClerkLegacyLinker(
    { verify: async () => credential },
    { verify: async () => false },
    { withSession: vi.fn() },
    { bindLegacy, recordTotp: vi.fn() },
  );
  await expect(linker.link("clerk", "legacy", "123456")).rejects.toMatchObject({
    status: 403,
  });
  expect(bindLegacy).not.toHaveBeenCalled();
});
