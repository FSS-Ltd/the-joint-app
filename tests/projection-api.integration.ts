import { randomBytes, randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  AuthContext,
  BasicProjectionInput,
  AdvancedProjectionInput,
} from "../packages/contracts/dist/index.js";
import {
  projectionRunDtoSchema,
  scenarioDtoSchema,
  scenarioListDtoSchema,
  projectionRunListDtoSchema,
} from "../packages/contracts/dist/index.js";
import { hashProjectionInput } from "../packages/projections/dist/index.js";
import { ProjectionsService } from "../apps/api/dist/modules/projections/projections.service.js";
import { EntitlementService } from "../apps/api/dist/modules/entitlements/entitlement.service.js";
import { IdentityVault } from "../apps/api/dist/modules/identity/identity-vault.js";
import { createGoalAllocationFixture } from "./fixtures/goal-allocation.js";

const money = (amountMinor: string) => ({
  amountMinor,
  currency: "GBP" as const,
});

describe("IOS9: Projection persistence and permission-safe API", () => {
  let f: ReturnType<typeof createGoalAllocationFixture>;
  let service: ProjectionsService;
  let entitlements: EntitlementService;

  beforeEach(async () => {
    f = createGoalAllocationFixture();
    await f.setup();

    const key = randomBytes(32).toString("base64");
    const vault = new IdentityVault(key, key);
    entitlements = new EntitlementService(f.scoped);
    service = new ProjectionsService(f.scoped, f.archive, vault, entitlements);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await f.close();
  });

  it("persists basic projection runs with exact replay and conflict rejection", async () => {
    const basicInput: BasicProjectionInput = {
      schema: "projection-input",
      schemaVersion: 1,
      mode: "BASIC",
      targetBasis: "FIXED_NOMINAL",
      opening: money("100000"), // £1,000
      target: money("500000"), // £5,000
      firstContributionDate: "2026-11-30",
      horizonMonths: 24,
      monthlyContributions: [{ fromMonth: 1, amount: money("20000") }], // £200/mo
    };

    const key = randomUUID();
    const run = await service.createBasicRun(f.a, f.goalId, basicInput, key);

    expect(run.mode).toBe("BASIC");
    expect(run.goalId).toBe(f.goalId);
    expect(run.scenarioId).toBeNull();
    expect(run.inputHash).toBe(hashProjectionInput(basicInput));
    expect(run.result.series.length).toBe(24);
    expect(projectionRunDtoSchema.parse(run)).toEqual(run);

    // Exact replay with same key
    const replayed = await service.createBasicRun(
      f.a,
      f.goalId,
      basicInput,
      key,
    );
    expect(replayed.id).toBe(run.id);

    // Conflict with different input
    await expect(
      service.createBasicRun(
        f.a,
        f.goalId,
        { ...basicInput, horizonMonths: 12 },
        key,
      ),
    ).rejects.toThrow();
  });

  it("enforces entitlement capability checks for scenarios and advanced runs", async () => {
    const scenarioId = randomUUID();
    const advancedInput: AdvancedProjectionInput = {
      schema: "projection-input",
      schemaVersion: 1,
      mode: "ADVANCED",
      scenarioId,
      targetBasis: "FIXED_NOMINAL",
      opening: money("100000"),
      target: money("500000"),
      firstContributionDate: "2026-11-30",
      horizonMonths: 24,
      monthlyContributions: [{ fromMonth: 1, amount: money("20000") }],
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

    const key = randomUUID();

    // 1. Without projections.advanced entitlement: rejected
    await expect(
      service.createScenario(f.a, f.goalId, advancedInput, key),
    ).rejects.toThrow();

    await expect(
      service.createAdvancedRun(f.a, f.goalId, scenarioId, key),
    ).rejects.toThrow();

    // 2. Grant projections.advanced (PLUS upgrade)
    const grantId = randomUUID();
    await f.owner.$executeRaw`
      INSERT INTO app."EntitlementGrant" (
        id, "householdId", "membershipId", "userId", issuer, reason, revision, capabilities, "issuedAt", "expiresAt"
      ) VALUES (
        ${grantId}::uuid,
        ${f.hh}::uuid,
        ${f.a.membershipId}::uuid,
        ${f.a.userId}::uuid,
        'founder',
        'test_plus',
        1,
        ARRAY['finance.manual', 'projections.basic', 'projections.advanced']::text[],
        now() - interval '1 hour',
        now() + interval '30 days'
      )`;

    // 3. Scenario creation now succeeds
    const scenario = await service.createScenario(
      f.a,
      f.goalId,
      advancedInput,
      key,
    );
    expect(scenario.id).toBe(scenarioId);
    expect(scenario.goalId).toBe(f.goalId);
    expect(scenario.version).toBe(1);
    expect(scenarioDtoSchema.parse(scenario)).toEqual(scenario);

    // Replay scenario creation
    const replayedScenario = await service.createScenario(
      f.a,
      f.goalId,
      advancedInput,
      key,
    );
    expect(replayedScenario.id).toBe(scenario.id);

    // 4. Advanced run creation now succeeds
    const runKey = randomUUID();
    const advancedRun = await service.createAdvancedRun(
      f.a,
      f.goalId,
      scenario.id,
      runKey,
    );
    expect(advancedRun.mode).toBe("ADVANCED");
    expect(advancedRun.scenarioId).toBe(scenario.id);
    expect(advancedRun.result.series.length).toBe(24);
    expect(projectionRunDtoSchema.parse(advancedRun)).toEqual(advancedRun);

    // 5. Read operations succeed
    const readScenario = await service.readScenario(f.a, scenario.id);
    expect(readScenario.id).toBe(scenario.id);

    const readRun = await service.readRun(f.a, advancedRun.id);
    expect(readRun.id).toBe(advancedRun.id);

    const scenarioList = await service.listScenarios(f.a, f.goalId);
    expect(scenarioList.scenarios.length).toBe(1);
    expect(scenarioListDtoSchema.parse(scenarioList)).toEqual(scenarioList);

    const runList = await service.listRuns(f.a, f.goalId);
    expect(runList.runs.length).toBe(1);
    expect(projectionRunListDtoSchema.parse(runList)).toEqual(runList);

    // 6. Downgrade / Revocation preservation: saved runs and scenarios remain readable
    await f.owner.$executeRaw`
      UPDATE app."EntitlementGrant"
      SET "revokedAt" = now()
      WHERE id = ${grantId}::uuid`;

    // Reading existing scenario and run still succeeds!
    const scenarioAfterDowngrade = await service.readScenario(f.a, scenario.id);
    expect(scenarioAfterDowngrade.id).toBe(scenario.id);

    const runAfterDowngrade = await service.readRun(f.a, advancedRun.id);
    expect(runAfterDowngrade.id).toBe(advancedRun.id);

    // But creating a new scenario fails again with 403
    await expect(
      service.createScenario(
        f.a,
        f.goalId,
        { ...advancedInput, scenarioId: randomUUID() },
        randomUUID(),
      ),
    ).rejects.toThrow();
  });

  it("enforces household tenancy boundaries and isolates cross-tenant access", async () => {
    // Set up an outsider in a separate household
    const otherHh = randomUUID();
    await f.owner.household.create({ data: { id: otherHh } });
    const outsider: AuthContext = {
      userId: randomUUID(),
      membershipId: randomUUID(),
      sessionId: randomUUID(),
      householdId: otherHh,
      grantVersion: 0,
      aal: "aal2",
      mfaAuthenticatedAt: Date.now(),
      requestId: "outsider",
    };
    await f.owner.user.create({
      data: {
        id: outsider.userId,
        memberships: {
          create: {
            id: outsider.membershipId,
            householdId: otherHh,
            slot: 1,
          },
        },
        sessions: {
          create: {
            id: outsider.sessionId,
            householdId: otherHh,
            expiresAt: new Date(Date.now() + 3600000),
          },
        },
      },
    });

    const basicInput: BasicProjectionInput = {
      schema: "projection-input",
      schemaVersion: 1,
      mode: "BASIC",
      targetBasis: "FIXED_NOMINAL",
      opening: money("100000"),
      target: money("500000"),
      firstContributionDate: "2026-11-30",
      horizonMonths: 12,
      monthlyContributions: [{ fromMonth: 1, amount: money("10000") }],
    };

    const run = await service.createBasicRun(
      f.a,
      f.goalId,
      basicInput,
      randomUUID(),
    );

    // Outsider cannot read Alice's run
    await expect(service.readRun(outsider, run.id)).rejects.toThrow();

    // Outsider cannot list Alice's goal runs
    await expect(service.listRuns(outsider, f.goalId)).rejects.toThrow();

    // Outsider cannot create runs on Alice's goal
    await expect(
      service.createBasicRun(outsider, f.goalId, basicInput, randomUUID()),
    ).rejects.toThrow();
  });

  it("rejects operations when caller grantVersion is stale or scope is invalid", async () => {
    const basicInput: BasicProjectionInput = {
      schema: "projection-input",
      schemaVersion: 1,
      mode: "BASIC",
      targetBasis: "FIXED_NOMINAL",
      opening: money("100000"),
      target: money("500000"),
      firstContributionDate: "2026-11-30",
      horizonMonths: 12,
      monthlyContributions: [{ fromMonth: 1, amount: money("10000") }],
    };

    const staleActor: AuthContext = {
      ...f.a,
      grantVersion: 999, // stale grantVersion
    };

    await expect(
      service.createBasicRun(staleActor, f.goalId, basicInput, randomUUID()),
    ).rejects.toThrow();
  });

  it("detects source staleness and partial source warnings on run reads", async () => {
    // 1. Allocate f.account and f.valuation to goal
    await f.writeAllocation();

    const basicInput: BasicProjectionInput = {
      schema: "projection-input",
      schemaVersion: 1,
      mode: "BASIC",
      targetBasis: "FIXED_NOMINAL",
      opening: money("100000"),
      target: money("500000"),
      firstContributionDate: "2026-11-30",
      horizonMonths: 12,
      monthlyContributions: [{ fromMonth: 1, amount: money("10000") }],
    };

    const run = await service.createBasicRun(
      f.a,
      f.goalId,
      basicInput,
      randomUUID(),
    );

    // Source valuation is recorded
    expect(run.source.valuations.length).toBe(1);
    const firstValuation = run.source.valuations[0];
    expect(firstValuation?.accountId).toBe(f.account);
    expect(firstValuation?.valuationId).toBe(f.valuation);

    // Initial read by author Alice has no staleness or permission warnings
    const initialRead = await service.readRun(f.a, run.id);
    expect(initialRead.result.warnings).not.toContain("PARTIAL_SOURCE");
    expect(initialRead.result.warnings).not.toContain("STALE_VALUATION");

    // When Bob has no grant on Alice's private account -> PARTIAL_SOURCE warning
    await f.owner.accountGrant.update({
      where: {
        accountId_membershipId: {
          accountId: f.account,
          membershipId: f.b.membershipId,
        },
      },
      data: { level: "NONE" },
    });
    const bobRead = await service.readRun(f.b, run.id);
    expect(bobRead.result.warnings).toContain("PARTIAL_SOURCE");

    // Insert newer snapshot for Alice's account -> STALE_VALUATION warning
    const newerSnapshotId = randomUUID();
    await f.owner.balanceSnapshot.create({
      data: {
        id: newerSnapshotId,
        accountId: f.account,
        householdId: f.hh,
        amountMinor: 60000n,
        adultAmountMinor: 60000n,
        authorMembershipId: f.a.membershipId,
        asOfDate: new Date(Date.now() + 86400000), // tomorrow
      },
    });

    const aliceReadAfterNewerSnapshot = await service.readRun(f.a, run.id);
    expect(aliceReadAfterNewerSnapshot.result.warnings).toContain(
      "STALE_VALUATION",
    );
  });
});
