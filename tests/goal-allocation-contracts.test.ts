import { describe, expect, it } from "vitest";
import {
  goalAllocationWriteSchema,
  goalAllocationSetDtoSchema,
  goalAllocationPageSchema,
  goalAllocationQuerySchema,
} from "../packages/contracts/src/goal-allocations.js";

const accountId = "a1111111-1111-4111-8111-111111111111";
const otherId = "b2222222-2222-4222-8222-222222222222";
const goalId = "c3333333-3333-4333-8333-333333333333";
const valuationId = "d4444444-4444-4444-8444-444444444444";
const money = (amountMinor: string) => ({ amountMinor, currency: "GBP" });
const allocation = {
  basis: "FIXED",
  accountId,
  valuationId,
  amount: money("30000"),
};
const write = {
  accountIds: [accountId],
  sourceVersions: [{ accountId, version: 0 }],
  allocations: [allocation],
};
const position = {
  accountId,
  status: "UNDERFUNDED",
  reason: null,
  available: money("50000"),
  committed: money("60000"),
  allocated: money("30000"),
  shortfall: money("10000"),
};
const view = {
  schema: "goal-allocation-set",
  schemaVersion: 2,
  householdId: otherId,
  goalId,
  version: 1,
  scope: {
    kind: "CONTROLLED",
    accountIds: [accountId],
    sources: [{ accountId, version: 2 }],
  },
  allocations: [allocation],
  positions: [position],
  asOfDate: "2026-10-26",
  calculatedAt: "2026-10-26T12:00:00.000Z",
};

describe("atomic allocation contracts", () => {
  it("preserves exact intentions and distinguishes an explicit scoped release", () => {
    const exact = {
      ...write,
      allocations: [{ ...allocation, amount: money("9007199254740993") }],
    };
    expect(goalAllocationWriteSchema.parse(exact)).toEqual(exact);
    expect(
      goalAllocationWriteSchema.parse({ ...write, allocations: [] }),
    ).toEqual({ ...write, allocations: [] });
  });

  it("rejects incomplete, duplicated or uncontrolled source vectors", () => {
    for (const input of [
      { ...write, ownerId: otherId },
      { ...write, accountIds: [] },
      { ...write, accountIds: [accountId, accountId.toUpperCase()] },
      { ...write, sourceVersions: [] },
      { ...write, sourceVersions: [{ accountId: otherId, version: 0 }] },
      {
        ...write,
        sourceVersions: [...write.sourceVersions, ...write.sourceVersions],
      },
      { ...write, sourceVersions: [{ accountId, version: -1 }] },
      { ...write, sourceVersions: [{ accountId, version: 2147483648 }] },
      { ...write, allocations: [{ ...allocation, accountId: otherId }] },
      {
        ...write,
        allocations: [
          allocation,
          { ...allocation, accountId: accountId.toUpperCase() },
        ],
      },
      { ...write, allocations: [{ ...allocation, amount: money("-1") }] },
      {
        ...write,
        allocations: [{ ...allocation, amount: money("9223372036854775808") }],
      },
      {
        ...write,
        allocations: [
          { ...allocation, amount: { amountMinor: "1", currency: "USD" } },
        ],
      },
    ])
      expect(goalAllocationWriteSchema.safeParse(input).success).toBe(false);
  });

  it("keeps a canonical fraction separate from money and its recorded valuation", () => {
    const fraction = {
      basis: "FRACTION",
      accountId,
      valuationId,
      fraction: "0.25",
    };
    expect(
      goalAllocationWriteSchema.safeParse({ ...write, allocations: [fraction] })
        .success,
    ).toBe(true);
    for (const value of ["0", "1.01", "0.2500", "0.0000000000001", 0.25])
      expect(
        goalAllocationWriteSchema.safeParse({
          ...write,
          allocations: [{ ...fraction, fraction: value }],
        }).success,
      ).toBe(false);
    expect(
      goalAllocationWriteSchema.safeParse({
        ...write,
        allocations: [{ ...fraction, amount: money("25") }],
      }).success,
    ).toBe(false);
  });

  it("validates a complete controlled view without hidden counts or global funding epochs", () => {
    expect(goalAllocationSetDtoSchema.parse(view)).toEqual(view);
    for (const input of [
      { ...view, hiddenAccountCount: 1 },
      { ...view, schemaVersion: 1 },
      { ...view, scope: { ...view.scope, sources: [] } },
      { ...view, scope: { ...view.scope, accountIds: [otherId] } },
      { ...view, positions: [] },
      { ...view, positions: [position, position] },
      { ...view, allocations: [{ ...allocation, accountId: otherId }] },
    ])
      expect(goalAllocationSetDtoSchema.safeParse(input).success).toBe(false);
  });

  it("requires exact conserved positions and explicit unavailable evidence", () => {
    for (const changed of [
      { ...position, shortfall: money("0") },
      { ...position, status: "FUNDED" },
      { ...position, allocated: money("70000") },
      { ...position, allocated: money("29999") },
      { ...position, available: null },
      { ...position, reason: "FUNDING_UNAVAILABLE" },
    ])
      expect(
        goalAllocationSetDtoSchema.safeParse({ ...view, positions: [changed] })
          .success,
      ).toBe(false);
    const unavailable = {
      accountId,
      status: "UNAVAILABLE",
      reason: "FUNDING_UNAVAILABLE",
      available: null,
      committed: null,
      allocated: null,
      shortfall: null,
    };
    expect(
      goalAllocationSetDtoSchema.safeParse({
        ...view,
        positions: [unavailable],
      }).success,
    ).toBe(true);
    expect(
      goalAllocationSetDtoSchema.safeParse({
        ...view,
        positions: [{ ...unavailable, available: money("0") }],
      }).success,
    ).toBe(false);
  });

  it("bounds immutable history to the selected goal, sources and visible source versions", () => {
    const entry = {
      householdId: otherId,
      accountId,
      goalId,
      version: 1,
      allocation,
      createdAt: "2026-10-26T11:00:00.000Z",
    };
    const page = {
      view,
      history: [entry, { ...entry, version: 2, allocation: null }],
      nextCursor: null,
    };
    expect(goalAllocationPageSchema.safeParse(page).success).toBe(true);
    for (const input of [
      { ...page, nextCursor: "" },
      { ...page, history: [entry, entry] },
      { ...page, history: [{ ...entry, accountId: otherId }] },
      { ...page, history: [{ ...entry, goalId: otherId }] },
      { ...page, history: [{ ...entry, version: 3 }] },
      {
        ...page,
        history: [
          { ...entry, allocation: { ...allocation, accountId: otherId } },
        ],
      },
      {
        ...page,
        history: Array.from({ length: 51 }, (_, index) => ({
          ...entry,
          version: index + 1,
        })),
      },
    ])
      expect(goalAllocationPageSchema.safeParse(input).success).toBe(false);
  });
});

it("canonicalizes explicit query scope and rejects undeclared selectors", () => {
  expect(
    goalAllocationQuerySchema.parse({
      accountIds: otherId.toUpperCase() + "," + accountId.toUpperCase(),
    }),
  ).toEqual({ accountIds: [accountId, otherId] });
  for (const query of [
    {},
    { accountIds: "" },
    { accountIds: accountId + "," + accountId.toUpperCase() },
    { accountIds: [accountId] },
    { accountIds: accountId, ownerId: otherId },
    { accountIds: accountId, cursor: "" },
    { accountIds: accountId, cursor: "a".repeat(4097) },
  ])
    expect(goalAllocationQuerySchema.safeParse(query).success).toBe(false);
});
