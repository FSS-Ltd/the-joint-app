import { afterEach, expect, it, vi } from "vitest";
import { StatusResources } from "../apps/api/src/modules/events/status-resources.js";
import { authorizeStatusObserver } from "../apps/api/src/modules/events/status-observer.js";
import {
  spendingQuerySchema,
  spendingReportSchema,
  statusSubscriptionSchema,
} from "../packages/contracts/src/index.js";

const householdId = "e237d3d7-236f-4ec3-8454-c4e5504d397f";

afterEach(() => vi.useRealTimers());

it("allows an explicit current report read and a household-only spending subscription", () => {
  expect(spendingQuerySchema.parse({ month: "current" }).month).toBe("current");
  expect(spendingQuerySchema.parse({ month: "2026-10" }).month).toBe("2026-10");
  expect(spendingQuerySchema.safeParse({}).success).toBe(false);
  const selector = { kind: "spending", householdId };
  expect(statusSubscriptionSchema.parse(selector)).toEqual(selector);
  for (const field of [
    { month: "2026-10" },
    { accountIds: householdId },
    { token: "synthetic" },
  ])
    expect(
      statusSubscriptionSchema.safeParse({ ...selector, ...field }).success,
    ).toBe(false);
});

it("publishes committed changes and the next London month with no idle reads", async () => {
  vi.useFakeTimers();
  const boundary = Date.parse("2026-08-31T23:00:00Z");
  vi.setSystemTime(boundary - 5000);
  const selector = statusSubscriptionSchema.parse({
    kind: "spending",
    householdId,
  });
  const context = {
    userId: "synthetic-user",
    householdId,
    membershipId: "synthetic-member",
    sessionId: "synthetic-session",
    grantVersion: 0,
    requestId: "synthetic-request",
    aal: "aal2" as const,
    authenticatedAt: Date.now(),
    mfaAuthenticatedAt: Date.now(),
  };
  const identity = {
    financeContext: vi.fn(async () => context),
    actor: vi.fn(async () => ({ ...context, emailHash: "opaque" })),
    subscriptionExpiry: vi.fn(async () => boundary + 5000),
  };
  let rows = 0;
  const reports = {
    observeCurrent: vi.fn(async () => {
      const before = Date.now() < boundary;
      const month = before ? "2026-08" : "2026-09";
      return {
        nextChangeAt: before ? boundary : Date.parse("2026-09-30T23:00:00Z"),
        report: spendingReportSchema.parse({
          month,
          startDate: `${month}-01`,
          endDateExclusive: before ? "2026-09-01" : "2026-10-01",
          scopeKey: "a".repeat(64),
          permissionKey: "b".repeat(64),
          calculatedAt: new Date().toISOString(),
          scope: [],
          coverage: {
            complete: false,
            closedPeriod: false,
            reasons: [],
            missingAccountIds: [],
          },
          summary: null,
          trend: [],
          comparison: null,
          budget: null,
          provenance: {
            source: "CSV_MANUAL",
            latestRecordDate: null,
            sourceRowCount: before ? rows : 0,
          },
        }),
      };
    }),
  };
  const resources = new StatusResources({ identity, reports });
  let wake = (): void => {
    throw new Error("No active observer");
  };
  const unsubscribe = vi.fn();
  const send = vi.fn(() => true);
  const observer = await authorizeStatusObserver({
    source: {
      subscribe(onWake) {
        wake = onWake;
        return unsubscribe;
      },
    },
    read: () => resources.read(selector, `Session ${"a".repeat(43)}`),
    send,
    close: vi.fn(),
  });
  try {
    observer.start();
    expect(send.mock.calls).toEqual([["change"]]);
    await vi.advanceTimersByTimeAsync(1000);
    expect(reports.observeCurrent).toHaveBeenCalledTimes(1);
    wake();
    await vi.advanceTimersByTimeAsync(0);
    expect(send).toHaveBeenCalledTimes(1);
    rows++;
    wake();
    await vi.advanceTimersByTimeAsync(0);
    expect(send).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(4000);
    expect(send.mock.calls).toEqual([["change"], ["change"], ["change"]]);
    expect(reports.observeCurrent).toHaveBeenCalledTimes(4);
    expect(identity.financeContext).toHaveBeenCalledTimes(4);
  } finally {
    observer.close();
  }
  expect(unsubscribe).toHaveBeenCalledOnce();
  expect(vi.getTimerCount()).toBe(0);
});
