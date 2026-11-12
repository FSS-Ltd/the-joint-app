import { afterEach, expect, it, vi } from "vitest";
import { StatusResources } from "../apps/api/src/modules/events/status-resources.js";
import {
  statusSubscriptionQuery,
  statusSubscriptionSchema,
} from "../packages/contracts/src/events.js";
import { valueAccounts } from "../packages/domain/src/wealth/value-accounts.js";
import { authorizeStatusObserver } from "../apps/api/src/modules/events/status-observer.js";
import { accountSchema } from "../packages/contracts/src/accounts.js";
import type { TransactionResponse } from "../packages/contracts/src/transactions.js";

const accountId = "e237d3d7-236f-4ec3-8454-c4e5504d397f";

afterEach(() => vi.useRealTimers());

it("accepts bounded account detail and page selectors using account list defaults", () => {
  expect(
    statusSubscriptionSchema.parse({
      kind: "account",
      householdId: accountId,
      id: accountId,
    }),
  ).toEqual({ kind: "account", householdId: accountId, id: accountId });
  expect(
    statusSubscriptionSchema.parse({
      kind: "accounts",
      householdId: accountId,
    }),
  ).toEqual({ kind: "accounts", householdId: accountId, limit: 50 });
  for (const limit of [1, 200, "2"]) {
    expect(
      statusSubscriptionSchema.safeParse({
        kind: "accounts",
        householdId: accountId,
        limit,
      }).success,
    ).toBe(true);
  }
  for (const fields of [
    { limit: 0 },
    { limit: 201 },
    { limit: 1.5 },
    { limit: [1, 2] },
    { limit: 2, cursor: "" },
    { limit: 2, cursor: "x".repeat(2049) },
    { limit: 2, cursor: ["a", "b"] },
    { limit: 2, token: "secret" },
    { limit: 2, id: accountId },
    { limit: 2, topic: "accounts" },
  ]) {
    expect(
      statusSubscriptionSchema.safeParse({
        kind: "accounts",
        householdId: accountId,
        ...fields,
      }).success,
    ).toBe(false);
  }
});

it("observes account projections with live authority and stable request-independent page fingerprints", async () => {
  const context = {
    userId: "user",
    sessionId: "session",
    householdId: accountId,
    membershipId: "member",
    grantVersion: 0,
    requestId: "request-a",
    aal: "aal2" as const,
    mfaAuthenticatedAt: Date.now(),
    authenticatedAt: Date.now(),
  };
  const identity = {
    financeContext: vi.fn(async () => context),
    actor: vi.fn(async () => ({ ...context, emailHash: "opaque" })),
    subscriptionExpiry: vi.fn(async () => 1900000000000),
  };
  const account = accountSchema.parse({
    id: accountId,
    householdId: accountId,
    label: "Synthetic account",
    kind: "CURRENT",
    currency: "GBP",
    legalOwnerKind: "ADULT",
    liquidity: "AVAILABLE",
    version: 1,
    source: "MANUAL",
    ownership: "OWNED",
    access: "TRANSACTIONS",
    latestValuation: null,
    sharing: null,
    permissions: { canEdit: true, canValue: true, canShare: false },
  });
  const accounts = {
    read: vi.fn(async () => account),
    observePage: vi.fn(async () => ({ items: [account], hasMore: true })),
    observeBalanceCalendar: vi.fn(async () => ({
      anchors: [{ accountId, anchorId: null as string | null }],
      nextChangeAt: null as number | null,
    })),
  };
  const resources = new StatusResources({ identity, accounts });
  const auth = `Session ${"a".repeat(43)}`;
  const detail = {
    kind: "account" as const,
    householdId: accountId,
    id: accountId,
  };
  const page = {
    kind: "accounts" as const,
    householdId: accountId,
    limit: 1,
    cursor: "opaque",
  };
  const first = await resources.read(detail, auth);
  expect(accounts.observeBalanceCalendar).toHaveBeenCalledWith(context, [
    accountId,
  ]);
  expect(first).toMatchObject({
    resourceExpiresAt: null,
    credentialExpiresAt: 1900000000000,
    expiryEvent: "renew",
  });
  identity.financeContext.mockResolvedValueOnce({
    ...context,
    requestId: "request-b",
  });
  expect((await resources.read(detail, auth)).fingerprint).toBe(
    first.fingerprint,
  );
  accounts.read.mockResolvedValueOnce({ ...account, label: "Committed label" });
  expect((await resources.read(detail, auth)).fingerprint).not.toBe(
    first.fingerprint,
  );
  const originalPage = await resources.read(page, auth);
  accounts.observeBalanceCalendar.mockResolvedValueOnce({
    anchors: [{ accountId, anchorId: "future-effective-anchor" }],
    nextChangeAt: Date.parse("2026-11-05T00:00:00.000Z"),
  });
  const changedAnchor = await resources.read(page, auth);
  expect(changedAnchor.fingerprint).not.toBe(originalPage.fingerprint);
  expect(changedAnchor.resourceExpiresAt).toBe(
    Date.parse("2026-11-05T00:00:00.000Z"),
  );
  identity.financeContext.mockResolvedValueOnce({
    ...context,
    requestId: "request-c",
  });
  expect((await resources.read(page, auth)).fingerprint).toBe(
    originalPage.fingerprint,
  );
  expect(accounts.observePage).toHaveBeenCalledWith(context, 1, "opaque");
  accounts.observePage.mockResolvedValueOnce({
    items: [account],
    hasMore: false,
  });
  expect((await resources.read(page, auth)).fingerprint).not.toBe(
    originalPage.fingerprint,
  );
  identity.financeContext.mockResolvedValueOnce({
    ...context,
    grantVersion: 1,
  });
  expect((await resources.read(page, auth)).fingerprint).not.toBe(
    originalPage.fingerprint,
  );
  identity.financeContext.mockRejectedValueOnce(new Error("revoked"));
  await expect(resources.read(page, auth)).rejects.toThrow("revoked");
  await expect(
    new StatusResources({ identity }).read(detail, auth),
  ).rejects.toThrow("Service Unavailable");
});

it("rejects ambiguous selectors and never accepts credentials or arbitrary topics", () => {
  const id = "e237d3d7-236f-4ec3-8454-c4e5504d397f";
  expect(
    statusSubscriptionSchema.safeParse({ kind: "import", id, householdId: id })
      .success,
  ).toBe(true);
  for (const value of [
    { kind: "import", id },
    { kind: "deletion", id, token: "secret" },
    { kind: "archive-export", id, householdId: id },
    { kind: "sql", id },
    { kind: ["import", "export"], id, householdId: id },
  ])
    expect(statusSubscriptionSchema.safeParse(value).success).toBe(false);
});

it("rechecks live authority and expiry, but ignores request IDs in private fingerprints", async () => {
  const base = {
    userId: "user",
    sessionId: "session",
    householdId: "household",
    membershipId: "member",
    grantVersion: 0,
    requestId: "request-a",
    aal: "aal2" as const,
    mfaAuthenticatedAt: Date.now(),
    authenticatedAt: Date.now(),
  };
  const identity = {
    financeContext: vi.fn(async () => base),
    actor: vi.fn(async () => ({ ...base, emailHash: "opaque" })),
    subscriptionExpiry: vi.fn(async () => Date.now() + 100000),
  };
  const status = {
    id: "e237d3d7-236f-4ec3-8454-c4e5504d397f",
    accountId: "e237d3d7-236f-4ec3-8454-c4e5504d397f",
    state: "READY" as const,
    version: 1,
    totalRows: 2,
    processedRows: 2,
    validRows: 2,
    rejectedRows: 0,
    overlapRows: 0,
    duplicateRows: 0,
    committedRows: 0,
    skippedRows: 0,
    failureCode: null,
    createdAt: new Date().toISOString(),
    committedAt: null,
    rolledBackAt: null,
    originalExpiresAt: null,
    originalAvailable: false,
    permissions: {
      canCommit: true,
      canRollback: false,
      canRestore: false,
      canDeleteOriginal: false,
    },
  };
  const imports = {
    observe: vi.fn(async () => ({ status, expiresAt: Date.now() + 5000 })),
  };
  const resources = new StatusResources({ identity, imports });
  const selector = {
    kind: "import" as const,
    id: "e237d3d7-236f-4ec3-8454-c4e5504d397f",
    householdId: "e237d3d7-236f-4ec3-8454-c4e5504d397f",
  };
  const auth = `Session ${"a".repeat(43)}`;
  const first = await resources.read(selector, auth);
  identity.financeContext.mockResolvedValueOnce({
    ...base,
    requestId: "request-b",
  });
  expect((await resources.read(selector, auth)).fingerprint).toBe(
    first.fingerprint,
  );
  identity.financeContext.mockResolvedValueOnce({ ...base, grantVersion: 1 });
  expect((await resources.read(selector, auth)).fingerprint).not.toBe(
    first.fingerprint,
  );
  identity.financeContext.mockRejectedValueOnce(new Error("revoked"));
  await expect(resources.read(selector, auth)).rejects.toThrow("revoked");
  expect(imports.observe).toHaveBeenCalledTimes(3);
  expect(identity.subscriptionExpiry).toHaveBeenCalledTimes(3);
  expect(first.fingerprint).not.toContain("household");
});

it("retains an export deadline crossed while its status read is resolving", async () => {
  vi.useFakeTimers();
  const now = Date.now();
  const context = {
    userId: "user",
    sessionId: "session",
    householdId: "household",
    membershipId: "member",
    grantVersion: 0,
    requestId: "request",
    aal: "aal2" as const,
    mfaAuthenticatedAt: now,
    authenticatedAt: now,
  };
  const identity = {
    financeContext: vi.fn(async () => context),
    actor: vi.fn(async () => ({ ...context, emailHash: "opaque" })),
    subscriptionExpiry: vi.fn(async () => now + 100000),
  };
  const status = {
    id: "e237d3d7-236f-4ec3-8454-c4e5504d397f",
    state: "READY" as const,
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + 10000).toISOString(),
    downloadExpiresAt: new Date(now + 20).toISOString(),
  };
  const exports = {
    status: vi.fn(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
      return status;
    }),
    archiveStatus: vi.fn(async () => status),
  };
  const reading = new StatusResources({ identity, exports }).read(
    { kind: "export", id: status.id, householdId: status.id },
    `Session ${"a".repeat(43)}`,
  );
  await vi.advanceTimersByTimeAsync(50);
  expect((await reading).resourceExpiresAt).toBe(now + 20);
});

it("canonicalizes wealth selectors and rejects ambiguous, empty or oversized scopes", () => {
  const second = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const selector = {
    kind: "wealth" as const,
    householdId: accountId,
    accountIds: `${accountId.toUpperCase()},${second.toUpperCase()}`,
  };
  expect(statusSubscriptionSchema.parse(selector)).toEqual({
    ...selector,
    accountIds: `${second},${accountId}`,
  });
  expect(statusSubscriptionQuery(selector)).toBe(
    `kind=wealth&householdId=${accountId}&accountIds=${second}%2C${accountId}`,
  );
  expect(
    statusSubscriptionSchema.parse({ kind: "wealth", householdId: accountId }),
  ).toEqual({ kind: "wealth", householdId: accountId });
  for (const fields of [
    { accountIds: "" },
    { accountIds: `${accountId},${accountId.toUpperCase()}` },
    { accountIds: [accountId, second] },
    { accountIds: "bad" },
    {
      accountIds: Array.from(
        { length: 51 },
        (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
      ).join(","),
    },
    { token: "secret" },
    { id: accountId },
    { kind: ["wealth", "wealth"] },
  ])
    expect(
      statusSubscriptionSchema.safeParse({
        kind: "wealth",
        householdId: accountId,
        ...fields,
      }).success,
    ).toBe(false);
});

function wealthFixture() {
  const context = {
    userId: "user",
    sessionId: "session",
    householdId: accountId,
    membershipId: "member",
    grantVersion: 0,
    requestId: "request",
    aal: "aal2" as const,
    mfaAuthenticatedAt: Date.now(),
    authenticatedAt: Date.now(),
  };
  const identity = {
    financeContext: vi.fn(async () => context),
    actor: vi.fn(async () => ({ ...context, emailHash: "opaque" })),
    subscriptionExpiry: vi.fn(async () => Date.now() + 172800000),
  };
  const summary = valueAccounts({
    householdId: accountId,
    grantVersion: 0,
    asOfDate: "2026-11-04",
    calculatedAt: "2026-11-04T12:00:00.000Z",
    accounts: [
      {
        id: accountId,
        kind: "SAVINGS",
        legalOwnerKind: "ADULT",
        liquidity: "AVAILABLE",
        totalsVersion: 1,
        snapshot: null,
      },
    ],
  });
  const wealth = {
    observe: vi.fn(async () => ({
      summary,
      nextChangeAt: Date.parse("2026-11-05T00:00:00.000Z"),
    })),
  };
  const selector = { kind: "wealth" as const, householdId: accountId };
  const auth = `Session ${"a".repeat(43)}`;
  const resources = new StatusResources({ identity, wealth });
  return { context, identity, summary, wealth, selector, auth, resources };
}
it("observes canonical wealth scope, ignores calculatedAt, and fingerprints dates, provenance and exclusions", async () => {
  const f = wealthFixture();
  const first = await f.resources.read(f.selector, f.auth);
  expect(first.resourceExpiresAt).toBe(Date.parse("2026-11-05T00:00:00.000Z"));
  f.wealth.observe.mockResolvedValueOnce({
    summary: { ...f.summary, calculatedAt: "2026-11-04T12:01:00.000Z" },
    nextChangeAt: first.resourceExpiresAt ?? 0,
  });
  expect((await f.resources.read(f.selector, f.auth)).fingerprint).toBe(
    first.fingerprint,
  );
  for (const summary of [
    { ...f.summary, asOfDate: "2026-11-05" },
    { ...f.summary, scope: { ...f.summary.scope, grantVersion: 1 } },
    {
      ...f.summary,
      scope: {
        ...f.summary.scope,
        accountIds: [],
        sources: [],
      },
    },
    {
      ...f.summary,
      scope: {
        ...f.summary.scope,
        sources: [{ accountId, totalsVersion: 2, valuationId: null }],
      },
    },
    {
      ...f.summary,
      scope: {
        ...f.summary.scope,
        sources: [
          {
            accountId,
            totalsVersion: 1,
            valuationId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          },
        ],
      },
    },
    { ...f.summary, excludedReasons: [] },
    {
      ...f.summary,
      adultNetWorth: { amountMinor: "0", currency: "GBP" as const },
    },
  ]) {
    f.wealth.observe.mockResolvedValueOnce({
      summary,
      nextChangeAt: first.resourceExpiresAt ?? 0,
    });
    expect((await f.resources.read(f.selector, f.auth)).fingerprint).not.toBe(
      first.fingerprint,
    );
  }
  await f.resources.read({ ...f.selector, accountIds: accountId }, f.auth);
  expect(f.wealth.observe).toHaveBeenLastCalledWith(f.context, [accountId]);
  expect(f.wealth.observe).toHaveBeenNthCalledWith(1, f.context, undefined);
  f.identity.financeContext.mockRejectedValueOnce(new Error("revoked"));
  await expect(f.resources.read(f.selector, f.auth)).rejects.toThrow("revoked");
  await expect(
    new StatusResources({ identity: f.identity }).read(f.selector, f.auth),
  ).rejects.toThrow("Service Unavailable");
});
it.each([false, true])(
  "wakes at the known wealth date once, reauthorizes and clears timers (revoked=%s)",
  async (revoked) => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-04T23:59:59.000Z"));
    const f = wealthFixture(),
      send = vi.fn(() => true),
      unsubscribe = vi.fn(),
      close = vi.fn();
    const observer = await authorizeStatusObserver({
      source: { subscribe: () => unsubscribe },
      read: () => f.resources.read(f.selector, f.auth),
      send,
      close,
      denied: (error) => error instanceof Error && error.message === "revoked",
    });
    observer.start();
    await vi.advanceTimersByTimeAsync(999);
    expect(f.wealth.observe).toHaveBeenCalledOnce();
    if (revoked)
      f.identity.financeContext.mockRejectedValueOnce(new Error("revoked"));
    else
      f.wealth.observe.mockResolvedValue({
        summary: { ...f.summary, asOfDate: "2026-11-05" },
        nextChangeAt: Date.parse("2026-11-06T00:00:00.000Z"),
      });
    await vi.advanceTimersByTimeAsync(1);
    expect(f.identity.financeContext).toHaveBeenCalledTimes(2);
    expect(send.mock.calls).toEqual([
      ["change"],
      [revoked ? "invalidate" : "change"],
    ]);
    await vi.advanceTimersByTimeAsync(60000);
    expect(f.identity.financeContext).toHaveBeenCalledTimes(2);
    observer.close();
    expect(unsubscribe).toHaveBeenCalledOnce();
    expect(close).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  },
);

const transactionId = "11111111-1111-4111-8111-111111111111";
const transactionPage: TransactionResponse = {
  id: transactionId,
  accountId,
  bookedDate: "2026-11-04",
  money: { amountMinor: "-125", currency: "GBP" },
  description: "Synthetic coffee",
  source: "MANUAL",
  version: 1,
  createdAt: "2026-11-04T10:00:00.000Z",
  category: null,
  classificationKind: null,
  effectiveKind: null,
  classificationConfirmed: false,
  splits: [],
  transfer: null,
  merchant: null,
  note: { body: null, version: 0 },
  permissions: { canCorrect: true, canClassify: true, canNote: true },
};
function transactionContext() {
  return {
    userId: "user",
    sessionId: "session",
    householdId: accountId,
    membershipId: "member",
    grantVersion: 0,
    requestId: "request-a",
    aal: "aal2" as const,
    mfaAuthenticatedAt: Date.now(),
    authenticatedAt: Date.now(),
  };
}

it("requires an account for a transaction selector and rejects unknown or ambiguous fields", () => {
  expect(
    statusSubscriptionSchema.parse({
      kind: "transactions",
      householdId: accountId,
      accountId,
    }),
  ).toMatchObject({ kind: "transactions", limit: 50 });
  for (const value of [
    { kind: "transactions", householdId: accountId },
    {
      kind: "transactions",
      householdId: accountId,
      accountId,
      topic: "activity",
    },
    {
      kind: "transactions",
      householdId: accountId,
      accountId,
      category: "Food",
      uncategorized: "true",
    },
    { kind: "transactions", householdId: accountId, accountId, limit: 201 },
  ])
    expect(statusSubscriptionSchema.safeParse(value).success).toBe(false);
});

it("observes one bounded transaction page and stays silent for request-only differences", async () => {
  const context = transactionContext();
  const identity = {
    financeContext: vi.fn(async () => context),
    actor: vi.fn(async () => ({ ...context, emailHash: "opaque" })),
    subscriptionExpiry: vi.fn(async () => 1900000000000),
  };
  const transactions = {
    observePage: vi.fn(async () => ({
      items: [transactionPage],
      hasMore: true,
    })),
  };
  const resources = new StatusResources({ identity, transactions });
  const auth = `Session ${"a".repeat(43)}`;
  const selector = {
    kind: "transactions" as const,
    householdId: accountId,
    accountId,
    limit: 2,
    cursor: "opaque",
    month: "2026-11" as const,
  };
  const first = await resources.read(selector, auth);
  expect(first).toMatchObject({
    resourceExpiresAt: null,
    credentialExpiresAt: 1900000000000,
    expiryEvent: "renew",
  });
  expect(transactions.observePage).toHaveBeenCalledWith(
    context,
    accountId,
    2,
    "opaque",
    { month: "2026-11" },
  );
  identity.financeContext.mockResolvedValueOnce({
    ...context,
    requestId: "request-b",
  });
  expect((await resources.read(selector, auth)).fingerprint).toBe(
    first.fingerprint,
  );
  transactions.observePage.mockResolvedValueOnce({
    items: [{ ...transactionPage, version: 2 }],
    hasMore: true,
  });
  expect((await resources.read(selector, auth)).fingerprint).not.toBe(
    first.fingerprint,
  );
  identity.financeContext.mockResolvedValueOnce({
    ...context,
    grantVersion: 1,
  });
  expect((await resources.read(selector, auth)).fingerprint).not.toBe(
    first.fingerprint,
  );
  await expect(
    new StatusResources({ identity }).read(selector, auth),
  ).rejects.toThrow("Service Unavailable");
});

it.each(["account", "accounts"] as const)(
  "wakes %s at a future effective balance anchor",
  async (kind) => {
    vi.useFakeTimers();
    const deadline = Date.parse("2026-11-05T00:00:00.000Z");
    vi.setSystemTime(deadline - 1000);
    const context = {
      userId: "user",
      sessionId: "session",
      householdId: accountId,
      membershipId: "member",
      grantVersion: 0,
      requestId: "request",
      aal: "aal2" as const,
      mfaAuthenticatedAt: Date.now(),
      authenticatedAt: Date.now(),
    };
    const identity = {
      financeContext: vi.fn(async () => context),
      actor: vi.fn(async () => ({ ...context, emailHash: "opaque" })),
      subscriptionExpiry: vi.fn(async () => deadline + 86400000),
    };
    const account = accountSchema.parse({
      id: accountId,
      householdId: accountId,
      label: "Synthetic",
      kind: "CURRENT",
      currency: "GBP",
      legalOwnerKind: "ADULT",
      liquidity: "AVAILABLE",
      version: 1,
      source: "MANUAL",
      ownership: "OWNED",
      access: "TRANSACTIONS",
      latestValuation: null,
      sharing: null,
      permissions: { canEdit: true, canValue: true, canShare: false },
    });
    const accounts = {
      read: vi.fn(async () => account),
      observePage: vi.fn(async () => ({ items: [account], hasMore: false })),
      observeBalanceCalendar: vi.fn(async () => ({
        anchors: [
          { accountId, anchorId: Date.now() < deadline ? null : accountId },
        ],
        nextChangeAt: Date.now() < deadline ? deadline : null,
      })),
    };
    const resources = new StatusResources({ identity, accounts });
    const selector =
      kind === "account"
        ? { kind, householdId: accountId, id: accountId }
        : { kind, householdId: accountId, limit: 50 };
    const send = vi.fn(() => true),
      unsubscribe = vi.fn(),
      close = vi.fn();
    const observer = await authorizeStatusObserver({
      source: { subscribe: () => unsubscribe },
      read: () => resources.read(selector, `Session ${"a".repeat(43)}`),
      send,
      close,
    });
    observer.start();
    await vi.advanceTimersByTimeAsync(999);
    expect(accounts.observeBalanceCalendar).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(send.mock.calls).toEqual([["change"], ["change"]]);
    expect(accounts.observeBalanceCalendar).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(60000);
    expect(accounts.observeBalanceCalendar).toHaveBeenCalledTimes(2);
    observer.close();
    expect(unsubscribe).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  },
);
