import { describe, expect, it, vi } from "vitest";
import { createGoalsApi } from "../apps/mobile/src/api/goals.js";
import type { NativeTransport } from "../apps/mobile/src/api/types.js";
import type {
  BasicProjectionInput,
  AdvancedProjectionInput,
  GoalWrite,
  GoalAllocationWrite,
  ContributionPlanWrite,
} from "../packages/contracts/src/index.js";

const householdId = "00000000-0000-4000-8000-000000000001";
const goalId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const scenarioId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const runId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const accountId = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const valuationId = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const idemKey = "11111111-1111-4111-8111-111111111111";

describe("createGoalsApi", () => {
  it("listGoals dispatches GET with household path and query params", async () => {
    const mockTransport: NativeTransport = {
      request: vi.fn().mockResolvedValue({ goals: [], nextCursor: null }),
      openStatus: vi.fn(),
    };
    const api = createGoalsApi(mockTransport);
    const controller = new AbortController();

    await api.listGoals(householdId, "cur_123", controller.signal);

    expect(mockTransport.request).toHaveBeenCalledWith(
      `households/${householdId}/goals?cursor=cur_123`,
      expect.anything(),
      expect.objectContaining({
        method: "GET",
        signal: controller.signal,
      }),
    );
  });

  it("readGoal dispatches GET to goal path", async () => {
    const mockTransport: NativeTransport = {
      request: vi.fn().mockResolvedValue({
        goal: { id: goalId },
        revisions: [],
        nextCursor: null,
      }),
      openStatus: vi.fn(),
    };
    const api = createGoalsApi(mockTransport);

    await api.readGoal(householdId, goalId);

    expect(mockTransport.request).toHaveBeenCalledWith(
      `households/${householdId}/goals/${goalId}`,
      expect.anything(),
      expect.objectContaining({
        method: "GET",
      }),
    );
  });

  it("writeGoal dispatches PUT with version, body and idempotency key", async () => {
    const mockTransport: NativeTransport = {
      request: vi.fn().mockResolvedValue({
        goal: { id: goalId, version: 2 },
        revisions: [],
        nextCursor: null,
      }),
      openStatus: vi.fn(),
    };
    const api = createGoalsApi(mockTransport);

    const input: GoalWrite = {
      name: "Home deposit",
      status: "ACTIVE",
      beneficiary: "ADULT",
      priority: 1,
      target: { amountMinor: "5000000", currency: "GBP" },
      targetDate: "2030-01-01",
    };

    await api.writeGoal(householdId, goalId, 1, input, idemKey);

    expect(mockTransport.request).toHaveBeenCalledWith(
      `households/${householdId}/goals/${goalId}`,
      expect.anything(),
      expect.objectContaining({
        method: "PUT",
        version: 1,
        body: expect.objectContaining({ name: "Home deposit" }),
        idempotencyKey: idemKey,
      }),
    );
  });

  it("readAllocations dispatches GET with accountIds query param", async () => {
    const mockTransport: NativeTransport = {
      request: vi.fn().mockResolvedValue({ allocations: [] }),
      openStatus: vi.fn(),
    };
    const api = createGoalsApi(mockTransport);

    await api.readAllocations(householdId, goalId, [accountId]);

    expect(mockTransport.request).toHaveBeenCalledWith(
      `households/${householdId}/goals/${goalId}/allocations?accountIds=${accountId}`,
      expect.anything(),
      expect.objectContaining({
        method: "GET",
      }),
    );
  });

  it("writeAllocations dispatches PUT with version and idempotency key", async () => {
    const mockTransport: NativeTransport = {
      request: vi.fn().mockResolvedValue({ allocations: [] }),
      openStatus: vi.fn(),
    };
    const api = createGoalsApi(mockTransport);

    const input: GoalAllocationWrite = {
      accountIds: [accountId],
      sourceVersions: [{ accountId, version: 1 }],
      allocations: [
        {
          accountId,
          valuationId,
          basis: "FIXED",
          amount: { amountMinor: "100000", currency: "GBP" },
        },
      ],
    };

    await api.writeAllocations(householdId, goalId, 2, input, idemKey);

    expect(mockTransport.request).toHaveBeenCalledWith(
      `households/${householdId}/goals/${goalId}/allocations`,
      expect.anything(),
      expect.objectContaining({
        method: "PUT",
        version: 2,
        idempotencyKey: idemKey,
      }),
    );
  });

  it("readContributionPlan and writeContributionPlan dispatch expected methods", async () => {
    const mockTransport: NativeTransport = {
      request: vi.fn().mockResolvedValue({ version: 1 }),
      openStatus: vi.fn(),
    };
    const api = createGoalsApi(mockTransport);

    await api.readContributionPlan(householdId, goalId);
    expect(mockTransport.request).toHaveBeenCalledWith(
      `households/${householdId}/goals/${goalId}/contribution-plan`,
      expect.anything(),
      expect.objectContaining({ method: "GET" }),
    );

    const writeInput: ContributionPlanWrite = {
      firstContributionDate: "2026-11-30",
      monthlyContributions: [
        { fromMonth: 1, amount: { amountMinor: "25000", currency: "GBP" } },
      ],
      expectedGoalVersion: 1,
      expectedPlanVersion: 0,
    };
    await api.writeContributionPlan(
      householdId,
      goalId,
      1,
      writeInput,
      idemKey,
    );
    expect(mockTransport.request).toHaveBeenCalledWith(
      `households/${householdId}/goals/${goalId}/contribution-plan`,
      expect.anything(),
      expect.objectContaining({
        method: "PUT",
        version: 1,
        idempotencyKey: idemKey,
      }),
    );
  });

  it("createBasicProjection dispatches POST to basic projections endpoint", async () => {
    const mockTransport: NativeTransport = {
      request: vi.fn().mockResolvedValue({ id: runId }),
      openStatus: vi.fn(),
    };
    const api = createGoalsApi(mockTransport);

    const input: BasicProjectionInput = {
      schema: "projection-input",
      schemaVersion: 1,
      mode: "BASIC",
      targetBasis: "FIXED_NOMINAL",
      opening: { amountMinor: "100000", currency: "GBP" },
      target: { amountMinor: "500000", currency: "GBP" },
      firstContributionDate: "2026-11-30",
      horizonMonths: 24,
      monthlyContributions: [
        { fromMonth: 1, amount: { amountMinor: "20000", currency: "GBP" } },
      ],
    };

    await api.createBasicProjection(householdId, goalId, input, idemKey);

    expect(mockTransport.request).toHaveBeenCalledWith(
      `households/${householdId}/goals/${goalId}/projections/basic`,
      expect.anything(),
      expect.objectContaining({
        method: "POST",
        body: expect.objectContaining({ horizonMonths: 24 }),
        idempotencyKey: idemKey,
      }),
    );
  });

  it("listProjections and readProjection dispatch GET requests", async () => {
    const mockTransport: NativeTransport = {
      request: vi.fn().mockResolvedValue({ runs: [] }),
      openStatus: vi.fn(),
    };
    const api = createGoalsApi(mockTransport);

    await api.listProjections(householdId, goalId);
    expect(mockTransport.request).toHaveBeenCalledWith(
      `households/${householdId}/goals/${goalId}/projections`,
      expect.anything(),
      expect.objectContaining({ method: "GET" }),
    );

    await api.readProjection(householdId, runId);
    expect(mockTransport.request).toHaveBeenCalledWith(
      `households/${householdId}/projections/${runId}`,
      expect.anything(),
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("scenario methods dispatch correctly", async () => {
    const mockTransport: NativeTransport = {
      request: vi.fn().mockResolvedValue({ id: scenarioId }),
      openStatus: vi.fn(),
    };
    const api = createGoalsApi(mockTransport);

    const scenarioInput: AdvancedProjectionInput = {
      schema: "projection-input",
      schemaVersion: 1,
      mode: "ADVANCED",
      scenarioId,
      targetBasis: "FIXED_NOMINAL",
      opening: { amountMinor: "100000", currency: "GBP" },
      target: { amountMinor: "500000", currency: "GBP" },
      firstContributionDate: "2026-11-30",
      horizonMonths: 24,
      monthlyContributions: [
        { fromMonth: 1, amount: { amountMinor: "20000", currency: "GBP" } },
      ],
      withdrawals: [],
      fixedFees: [],
      tax: [],
      grossAnnualRate: "0.06",
      proportionalFeeAnnualRate: "0.005",
      inflationAnnualRate: "0.02",
      rateProvenance: {
        growth: {
          sourceKind: "ILLUSTRATION",
          sourceRef: null,
          effectiveDate: "2026-11-01",
          convention: "EFFECTIVE_ANNUAL",
        },
        fee: {
          sourceKind: "USER",
          sourceRef: null,
          effectiveDate: "2026-11-01",
          convention: "EFFECTIVE_ANNUAL",
        },
        inflation: {
          sourceKind: "USER",
          sourceRef: null,
          effectiveDate: "2026-11-01",
          convention: "EFFECTIVE_ANNUAL",
        },
      },
    };

    await api.createScenario(householdId, goalId, scenarioInput, idemKey);
    expect(mockTransport.request).toHaveBeenCalledWith(
      `households/${householdId}/goals/${goalId}/scenarios`,
      expect.anything(),
      expect.objectContaining({
        method: "POST",
        body: expect.objectContaining({ grossAnnualRate: "0.06" }),
        idempotencyKey: idemKey,
      }),
    );

    await api.listScenarios(householdId, goalId);
    expect(mockTransport.request).toHaveBeenCalledWith(
      `households/${householdId}/goals/${goalId}/scenarios`,
      expect.anything(),
      expect.objectContaining({ method: "GET" }),
    );

    await api.readScenario(householdId, scenarioId);
    expect(mockTransport.request).toHaveBeenCalledWith(
      `households/${householdId}/scenarios/${scenarioId}`,
      expect.anything(),
      expect.objectContaining({ method: "GET" }),
    );

    await api.createAdvancedProjection(
      householdId,
      goalId,
      scenarioId,
      idemKey,
    );
    expect(mockTransport.request).toHaveBeenCalledWith(
      `households/${householdId}/goals/${goalId}/projections`,
      expect.anything(),
      expect.objectContaining({
        method: "POST",
        body: { scenarioId },
        idempotencyKey: idemKey,
      }),
    );
  });

  it("validates parameters and rejects malformed IDs before request", async () => {
    const mockTransport: NativeTransport = {
      request: vi.fn(),
      openStatus: vi.fn(),
    };
    const api = createGoalsApi(mockTransport);

    await expect(api.readGoal("not-a-uuid", goalId)).rejects.toThrow();
    await expect(api.readGoal(householdId, "bad-goal")).rejects.toThrow();
    await expect(api.readProjection(householdId, "bad-run")).rejects.toThrow();
    expect(mockTransport.request).not.toHaveBeenCalled();
  });
});
