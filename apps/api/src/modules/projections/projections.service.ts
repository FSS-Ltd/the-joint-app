import { randomUUID } from "node:crypto";
import {
  basicProjectionInputSchema,
  advancedProjectionInputSchema,
  projectionRunDtoSchema,
  scenarioDtoSchema,
  scenarioListDtoSchema,
  projectionRunListDtoSchema,
  idempotencyKeySchema,
  type AuthContext,
  type BasicProjectionInput,
  type AdvancedProjectionInput,
  type ProjectionRunDto,
  type ScenarioDto,
  type ScenarioListDto,
  type ProjectionRunListDto,
} from "@joint/contracts";
import type { ScopedDatabase } from "@joint/database/scoped";
import type { ArchiveDatabase } from "@joint/database/archive";
import { calculateProjection, canonicalJson } from "@joint/projections";
import { RequestReplay } from "../households/request-replay.js";
import { hashToken, type IdentityVault } from "../identity/identity-vault.js";
import type { EntitlementService } from "../entitlements/entitlement.service.js";
import { validateInput } from "../../http-input.js";
import { safeProjectionQuery } from "./projection-errors.js";

export class ProjectionsService {
  private readonly replay: RequestReplay;

  constructor(
    private readonly database: Pick<ScopedDatabase, "withScope">,
    private readonly archive: Pick<ArchiveDatabase, "withScope">,
    private readonly vault: IdentityVault,
    private readonly entitlements: EntitlementService,
  ) {
    this.replay = new RequestReplay(vault);
  }

  async createBasicRun(
    context: AuthContext,
    goalId: string,
    rawInput: BasicProjectionInput,
    rawKey: string,
  ): Promise<ProjectionRunDto> {
    const validGoalId = validateInput(idempotencyKeySchema, goalId);
    const validKey = validateInput(idempotencyKeySchema, rawKey);
    const input = validateInput(basicProjectionInputSchema, rawInput);
    const canonical = canonicalJson(input);
    const route = `projections:basic:${context.householdId}:${validGoalId}`;
    const digest = hashToken(canonical);

    return safeProjectionQuery(() =>
      this.database.withScope(context, async (tx) => {
        const previous = await this.replay.read(
          tx,
          context.userId,
          route,
          validKey,
          digest,
          projectionRunDtoSchema,
        );
        if (previous) return previous;

        const result = calculateProjection(input, { engineVersion: "1.0.0" });
        const runId = randomUUID();

        const [row] = await tx.$queryRaw<{ data: unknown }[]>`
          SELECT app.write_projection_run(
            ${validGoalId}::uuid,
            ${runId}::uuid,
            NULL,
            'BASIC'::app."ProjectionMode",
            ${canonical},
            ${JSON.stringify(input)}::jsonb,
            ${JSON.stringify(result)}::jsonb,
            '1.0.0',
            NULL,
            ${context.grantVersion}::integer,
            '[]'::jsonb
          ) AS data`;

        const saved = projectionRunDtoSchema.parse(row?.data);
        await this.replay.save(
          tx,
          context.userId,
          route,
          validKey,
          digest,
          saved,
        );
        return saved;
      }),
    );
  }

  async createScenario(
    context: AuthContext,
    goalId: string,
    rawInput: AdvancedProjectionInput,
    rawKey: string,
  ): Promise<ScenarioDto> {
    await this.entitlements.require(context, "projections.advanced");

    const validGoalId = validateInput(idempotencyKeySchema, goalId);
    const validKey = validateInput(idempotencyKeySchema, rawKey);
    const input = validateInput(advancedProjectionInputSchema, rawInput);
    const canonical = canonicalJson(input);
    const route = `scenarios:${context.householdId}:${validGoalId}`;
    const digest = hashToken(canonical);

    return safeProjectionQuery(() =>
      this.database.withScope(context, async (tx) => {
        const previous = await this.replay.read(
          tx,
          context.userId,
          route,
          validKey,
          digest,
          scenarioDtoSchema,
        );
        if (previous) return previous;

        const [row] = await tx.$queryRaw<{ data: unknown }[]>`
          SELECT app.write_scenario(
            ${validGoalId}::uuid,
            ${input.scenarioId}::uuid,
            ${canonical},
            ${JSON.stringify(input)}::jsonb
          ) AS data`;

        const saved = scenarioDtoSchema.parse(row?.data);
        await this.replay.save(
          tx,
          context.userId,
          route,
          validKey,
          digest,
          saved,
        );
        return saved;
      }),
    );
  }

  async createAdvancedRun(
    context: AuthContext,
    goalId: string,
    scenarioId: string,
    rawKey: string,
  ): Promise<ProjectionRunDto> {
    await this.entitlements.require(context, "projections.advanced");

    const validGoalId = validateInput(idempotencyKeySchema, goalId);
    const validScenarioId = validateInput(idempotencyKeySchema, scenarioId);
    const validKey = validateInput(idempotencyKeySchema, rawKey);
    const route = `projections:adv:${validGoalId}:${validScenarioId}`;
    const digest = hashToken(validScenarioId);

    return safeProjectionQuery(() =>
      this.database.withScope(context, async (tx) => {
        const previous = await this.replay.read(
          tx,
          context.userId,
          route,
          validKey,
          digest,
          projectionRunDtoSchema,
        );
        if (previous) return previous;

        // Read the scenario to obtain its exact input
        const [scenarioRow] = await tx.$queryRaw<{ data: unknown }[]>`
          SELECT app.read_scenario(${validScenarioId}::uuid) AS data`;
        const scenario = scenarioDtoSchema.parse(scenarioRow?.data);

        const canonical = canonicalJson(scenario.input);
        const result = calculateProjection(scenario.input, {
          engineVersion: "1.0.0",
        });
        const runId = randomUUID();

        const [row] = await tx.$queryRaw<{ data: unknown }[]>`
          SELECT app.write_projection_run(
            ${validGoalId}::uuid,
            ${runId}::uuid,
            ${validScenarioId}::uuid,
            'ADVANCED'::app."ProjectionMode",
            ${canonical},
            ${JSON.stringify(scenario.input)}::jsonb,
            ${JSON.stringify(result)}::jsonb,
            '1.0.0',
            NULL,
            ${context.grantVersion}::integer,
            '[]'::jsonb
          ) AS data`;

        const saved = projectionRunDtoSchema.parse(row?.data);
        await this.replay.save(
          tx,
          context.userId,
          route,
          validKey,
          digest,
          saved,
        );
        return saved;
      }),
    );
  }

  async readScenario(
    context: AuthContext,
    scenarioId: string,
  ): Promise<ScenarioDto> {
    const validScenarioId = validateInput(idempotencyKeySchema, scenarioId);
    return safeProjectionQuery(() =>
      this.database.withScope(context, async (tx) => {
        const [row] = await tx.$queryRaw<{ data: unknown }[]>`
          SELECT app.read_scenario(${validScenarioId}::uuid) AS data`;
        return scenarioDtoSchema.parse(row?.data);
      }),
    );
  }

  async listScenarios(
    context: AuthContext,
    goalId: string,
  ): Promise<ScenarioListDto> {
    const validGoalId = validateInput(idempotencyKeySchema, goalId);
    return safeProjectionQuery(() =>
      this.database.withScope(context, async (tx) => {
        const [row] = await tx.$queryRaw<{ data: unknown }[]>`
          SELECT app.list_scenarios(${validGoalId}::uuid) AS data`;
        const scenarios = scenarioDtoSchema.array().parse(row?.data);
        return scenarioListDtoSchema.parse({
          schema: "scenario-list",
          schemaVersion: 1,
          householdId: context.householdId,
          goalId: validGoalId,
          scenarios,
        });
      }),
    );
  }

  async readRun(
    context: AuthContext,
    runId: string,
  ): Promise<ProjectionRunDto> {
    const validRunId = validateInput(idempotencyKeySchema, runId);
    return safeProjectionQuery(() =>
      this.database.withScope(context, async (tx) => {
        const [row] = await tx.$queryRaw<{ data: unknown }[]>`
          SELECT app.read_projection_run(${validRunId}::uuid) AS data`;
        return projectionRunDtoSchema.parse(row?.data);
      }),
    );
  }

  async listRuns(
    context: AuthContext,
    goalId: string,
  ): Promise<ProjectionRunListDto> {
    const validGoalId = validateInput(idempotencyKeySchema, goalId);
    return safeProjectionQuery(() =>
      this.database.withScope(context, async (tx) => {
        const [row] = await tx.$queryRaw<{ data: unknown }[]>`
          SELECT app.list_projection_runs(${validGoalId}::uuid) AS data`;
        const runs = projectionRunDtoSchema.array().parse(row?.data);
        return projectionRunListDtoSchema.parse({
          schema: "projection-run-list",
          schemaVersion: 1,
          householdId: context.householdId,
          goalId: validGoalId,
          runs,
        });
      }),
    );
  }
}
