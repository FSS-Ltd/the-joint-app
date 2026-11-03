import { expect, it, vi } from "vitest";
import {
  logoutIdentity,
  retryProviderCleanup,
} from "../apps/mobile/src/features/identity/logout.js";
import { guardTokenCache } from "../apps/mobile/src/features/identity/secure-cache.js";
const ticket = "v1.abc.def.ghi";
it.each(["local", "global"] as const)(
  "revokes %s on server before provider cleanup",
  async (scope) => {
    const events: string[] = [];
    const deps = {
      logout: vi.fn(async () => {
        events.push("server");
        return { state: "SIGNED_OUT" as const };
      }),
      revoke: () => events.push("revoke"),
      saveTicket: vi.fn(async () => {
        events.push("save");
      }),
      signOut: vi.fn(async () => {
        events.push("provider");
      }),
    };
    await logoutIdentity(scope, deps);
    expect(deps.logout).toHaveBeenCalledWith(scope);
    expect(events).toEqual(["server", "revoke", "provider"]);
  },
);
it("preserves the cleanup capability during provider outage and never restores revoked access", async () => {
  const revoke = vi.fn(),
    saveTicket = vi.fn<(value: string | null) => Promise<void>>(async () => {}),
    signOut = vi.fn(async () => {
      throw Error();
    });
  await expect(
    logoutIdentity("global", {
      logout: async () => ({
        state: "SIGNED_OUT",
        providerCleanupPending: true,
        providerCleanupToken: ticket,
      }),
      revoke,
      saveTicket,
      signOut,
    }),
  ).rejects.toThrow();
  expect(revoke).toHaveBeenCalledOnce();
  expect(saveTicket).toHaveBeenCalledWith(ticket);
  const retry = vi.fn(async () => ({ state: "SIGNED_OUT" as const }));
  await retryProviderCleanup(ticket, retry, saveTicket);
  expect(saveTicket).toHaveBeenLastCalledWith(null);
});
it("never signs out locally before server revocation succeeds", async () => {
  const revoke = vi.fn(),
    signOut = vi.fn();
  await expect(
    logoutIdentity("local", {
      logout: async () => {
        throw Error();
      },
      revoke,
      saveTicket: async () => {},
      signOut,
    }),
  ).rejects.toThrow();
  expect(revoke).not.toHaveBeenCalled();
  expect(signOut).not.toHaveBeenCalled();
});
it("fails closed when secure token storage fails", async () => {
  const failed = vi.fn();
  const cache = guardTokenCache(
    {
      getToken: async () => {
        throw Error("private");
      },
      saveToken: async () => {
        throw Error("private");
      },
      clearToken: async () => {},
    },
    failed,
  );
  await expect(cache.getToken("key")).rejects.toThrow(
    "Secure session storage is unavailable",
  );
  await expect(cache.saveToken("key", "token")).rejects.toThrow(
    "Secure session storage is unavailable",
  );
  expect(failed).toHaveBeenCalledTimes(2);
});
it("never discards an outstanding cleanup ticket on a later successful local revocation", async () => {
  const saveTicket = vi.fn<(value: string | null) => Promise<void>>(
    async () => {},
  );
  await logoutIdentity("local", {
    logout: async () => ({ state: "SIGNED_OUT" }),
    revoke: () => {},
    saveTicket,
    signOut: async () => {},
  });
  expect(saveTicket).not.toHaveBeenCalled();
});
it("retains an immutable retry capability while provider cleanup remains unavailable", async () => {
  const save = vi.fn<(value: string | null) => Promise<void>>(async () => {});
  await retryProviderCleanup(
    ticket,
    async () => ({
      state: "SIGNED_OUT",
      providerCleanupPending: true,
      providerCleanupToken: ticket,
    }),
    save,
  );
  expect(save).toHaveBeenCalledWith(ticket);
});
