import { randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import type { OwnerArchiveContext } from "../packages/database/src/archive-transaction.js";
import { PrivacyService } from "../apps/api/src/modules/privacy/privacy.service.js";

const context = (): OwnerArchiveContext => ({
  userId: randomUUID(),
  sessionId: randomUUID(),
  requestId: randomUUID(),
  aal: "aal2",
  mfaAuthenticatedAt: Date.now(),
});
it("requires fresh MFA and verified live identity before journalling a deletion intent", async () => {
  const calls: string[] = [];
  const service = new PrivacyService(
    {
      authorize: async () => {
        calls.push("authorize");
        throw new Error("invalid identity");
      },
      request: async () => {
        throw new Error("must not mutate");
      },
      status: async () => null,
    },
    {
      append: async () => {
        calls.push("journal");
      },
    },
  );
  await expect(
    service.request({ ...context(), aal: "aal1" }, randomUUID()),
  ).rejects.toThrow();
  expect(calls).toEqual([]);
  await expect(service.request(context(), randomUUID())).rejects.toThrow(
    "invalid identity",
  );
  expect(calls).toEqual(["authorize"]);
});
it("does not mutate account state if the independent journal cannot persist the verified intent", async () => {
  const calls: string[] = [];
  const service = new PrivacyService(
    {
      authorize: async () => {
        calls.push("authorize");
      },
      request: async () => {
        calls.push("mutation");
        throw new Error("must not mutate");
      },
      status: async () => null,
    },
    {
      append: async () => {
        calls.push("journal");
        throw new Error("Privacy journal unavailable");
      },
    },
  );
  await expect(service.request(context(), randomUUID())).rejects.toThrow(
    "Privacy journal unavailable",
  );
  expect(calls).toEqual(["authorize", "journal"]);
});
it("returns only a purpose-bound receipt after durable intent precedes revocation", async () => {
  const calls: string[] = [],
    id = randomUUID();
  const service = new PrivacyService(
    {
      authorize: async () => {
        calls.push("authorize");
      },
      request: async (_context, requestId, hash) => {
        calls.push("mutation");
        expect(hash).toMatch(/^[a-f0-9]{64}$/);
        return {
          id: requestId,
          state: "PENDING",
          requestedAt: new Date().toISOString(),
          completedAt: null,
        };
      },
      status: async () => null,
    },
    {
      append: async () => {
        calls.push("journal");
      },
    },
  );
  const receipt = await service.request(context(), id);
  expect(calls).toEqual(["authorize", "journal", "mutation"]);
  expect(receipt).toMatchObject({ id, state: "PENDING" });
  expect(receipt.statusToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
  await expect(service.status(id, receipt.statusToken)).rejects.toThrow();
});
