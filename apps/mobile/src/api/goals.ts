import {
  goalListDtoSchema,
  goalPageDtoSchema,
  goalWriteSchema,
  goalAllocationPageSchema,
  goalAllocationWriteSchema,
  contributionPlanWriteSchema,
  contributionBudgetViewSchema,
  basicProjectionInputSchema,
  advancedProjectionInputSchema,
  projectionRunDtoSchema,
  projectionRunListDtoSchema,
  scenarioDtoSchema,
  scenarioListDtoSchema,
  idempotencyKeySchema,
  quotedVersionSchema,
  scopeAccountIdsSchema,
  type GoalListDto,
  type GoalPageDto,
  type GoalWrite,
  type GoalAllocationPage,
  type GoalAllocationWrite,
  type ContributionPlanWrite,
  type ContributionBudgetView,
  type BasicProjectionInput,
  type AdvancedProjectionInput,
  type ProjectionRunDto,
  type ProjectionRunListDto,
  type ScenarioDto,
  type ScenarioListDto,
} from "@joint/contracts";
import type { NativeTransport } from "./types";

function version(value: number): number {
  return quotedVersionSchema.parse(`"${value}"`);
}

function household(id: string): string {
  return `households/${idempotencyKeySchema.parse(id)}`;
}

function goalResource(householdId: string, goalId: string): string {
  return `${household(householdId)}/goals/${idempotencyKeySchema.parse(goalId)}`;
}

export function createGoalsApi(transport: NativeTransport) {
  return {
    async listGoals(
      householdId: string,
      cursor?: string,
      signal?: AbortSignal,
    ): Promise<GoalListDto> {
      const path = `${household(householdId)}/goals`;
      const query = new URLSearchParams();
      if (cursor !== undefined) query.set("cursor", cursor);
      const suffix = query.size ? `?${query.toString()}` : "";
      return transport.request(`${path}${suffix}`, goalListDtoSchema, {
        method: "GET",
        signal: signal ?? new AbortController().signal,
      });
    },

    async readGoal(
      householdId: string,
      goalId: string,
      cursor?: string,
      signal?: AbortSignal,
    ): Promise<GoalPageDto> {
      const path = goalResource(householdId, goalId);
      const query = new URLSearchParams();
      if (cursor !== undefined) query.set("cursor", cursor);
      const suffix = query.size ? `?${query.toString()}` : "";
      return transport.request(`${path}${suffix}`, goalPageDtoSchema, {
        method: "GET",
        signal: signal ?? new AbortController().signal,
      });
    },

    async writeGoal(
      householdId: string,
      goalId: string,
      expectedVersion: number,
      input: GoalWrite,
      idempotencyKey: string,
      signal?: AbortSignal,
    ): Promise<GoalPageDto> {
      const path = goalResource(householdId, goalId);
      const parsedBody = goalWriteSchema.parse(input);
      return transport.request(path, goalPageDtoSchema, {
        method: "PUT",
        signal: signal ?? new AbortController().signal,
        body: parsedBody,
        version: version(expectedVersion),
        idempotencyKey: idempotencyKeySchema.parse(idempotencyKey),
      });
    },

    async readAllocations(
      householdId: string,
      goalId: string,
      accountIds?: readonly string[],
      cursor?: string,
      signal?: AbortSignal,
    ): Promise<GoalAllocationPage> {
      const path = `${goalResource(householdId, goalId)}/allocations`;
      const query = new URLSearchParams();
      if (accountIds !== undefined) {
        query.set(
          "accountIds",
          scopeAccountIdsSchema.parse(accountIds).join(","),
        );
      }
      if (cursor !== undefined) query.set("cursor", cursor);
      const suffix = query.size ? `?${query.toString()}` : "";
      return transport.request(`${path}${suffix}`, goalAllocationPageSchema, {
        method: "GET",
        signal: signal ?? new AbortController().signal,
      });
    },

    async writeAllocations(
      householdId: string,
      goalId: string,
      expectedVersion: number,
      input: GoalAllocationWrite,
      idempotencyKey: string,
      signal?: AbortSignal,
    ): Promise<GoalAllocationPage> {
      const path = `${goalResource(householdId, goalId)}/allocations`;
      const parsedBody = goalAllocationWriteSchema.parse(input);
      return transport.request(path, goalAllocationPageSchema, {
        method: "PUT",
        signal: signal ?? new AbortController().signal,
        body: parsedBody,
        version: version(expectedVersion),
        idempotencyKey: idempotencyKeySchema.parse(idempotencyKey),
      });
    },

    async readContributionPlan(
      householdId: string,
      goalId: string,
      signal?: AbortSignal,
    ): Promise<ContributionBudgetView> {
      const path = `${goalResource(householdId, goalId)}/contribution-plan`;
      return transport.request(path, contributionBudgetViewSchema, {
        method: "GET",
        signal: signal ?? new AbortController().signal,
      });
    },

    async writeContributionPlan(
      householdId: string,
      goalId: string,
      expectedVersion: number,
      input: ContributionPlanWrite,
      idempotencyKey: string,
      signal?: AbortSignal,
    ): Promise<ContributionBudgetView> {
      const path = `${goalResource(householdId, goalId)}/contribution-plan`;
      const parsedBody = contributionPlanWriteSchema.parse(input);
      return transport.request(path, contributionBudgetViewSchema, {
        method: "PUT",
        signal: signal ?? new AbortController().signal,
        body: parsedBody,
        version: version(expectedVersion),
        idempotencyKey: idempotencyKeySchema.parse(idempotencyKey),
      });
    },

    async createBasicProjection(
      householdId: string,
      goalId: string,
      input: BasicProjectionInput,
      idempotencyKey: string,
      signal?: AbortSignal,
    ): Promise<ProjectionRunDto> {
      const path = `${goalResource(householdId, goalId)}/projections/basic`;
      const parsedBody = basicProjectionInputSchema.parse(input);
      return transport.request(path, projectionRunDtoSchema, {
        method: "POST",
        signal: signal ?? new AbortController().signal,
        body: parsedBody,
        idempotencyKey: idempotencyKeySchema.parse(idempotencyKey),
      });
    },

    async listProjections(
      householdId: string,
      goalId: string,
      signal?: AbortSignal,
    ): Promise<ProjectionRunListDto> {
      const path = `${goalResource(householdId, goalId)}/projections`;
      return transport.request(path, projectionRunListDtoSchema, {
        method: "GET",
        signal: signal ?? new AbortController().signal,
      });
    },

    async readProjection(
      householdId: string,
      projectionId: string,
      signal?: AbortSignal,
    ): Promise<ProjectionRunDto> {
      const path = `${household(householdId)}/projections/${idempotencyKeySchema.parse(projectionId)}`;
      return transport.request(path, projectionRunDtoSchema, {
        method: "GET",
        signal: signal ?? new AbortController().signal,
      });
    },

    async createScenario(
      householdId: string,
      goalId: string,
      input: AdvancedProjectionInput,
      idempotencyKey: string,
      signal?: AbortSignal,
    ): Promise<ScenarioDto> {
      const path = `${goalResource(householdId, goalId)}/scenarios`;
      const parsedBody = advancedProjectionInputSchema.parse(input);
      return transport.request(path, scenarioDtoSchema, {
        method: "POST",
        signal: signal ?? new AbortController().signal,
        body: parsedBody,
        idempotencyKey: idempotencyKeySchema.parse(idempotencyKey),
      });
    },

    async listScenarios(
      householdId: string,
      goalId: string,
      signal?: AbortSignal,
    ): Promise<ScenarioListDto> {
      const path = `${goalResource(householdId, goalId)}/scenarios`;
      return transport.request(path, scenarioListDtoSchema, {
        method: "GET",
        signal: signal ?? new AbortController().signal,
      });
    },

    async readScenario(
      householdId: string,
      scenarioId: string,
      signal?: AbortSignal,
    ): Promise<ScenarioDto> {
      const path = `${household(householdId)}/scenarios/${idempotencyKeySchema.parse(scenarioId)}`;
      return transport.request(path, scenarioDtoSchema, {
        method: "GET",
        signal: signal ?? new AbortController().signal,
      });
    },

    async createAdvancedProjection(
      householdId: string,
      goalId: string,
      scenarioId: string,
      idempotencyKey: string,
      signal?: AbortSignal,
    ): Promise<ProjectionRunDto> {
      const path = `${goalResource(householdId, goalId)}/projections`;
      return transport.request(path, projectionRunDtoSchema, {
        method: "POST",
        signal: signal ?? new AbortController().signal,
        body: { scenarioId: idempotencyKeySchema.parse(scenarioId) },
        idempotencyKey: idempotencyKeySchema.parse(idempotencyKey),
      });
    },
  };
}

export type GoalsApi = ReturnType<typeof createGoalsApi>;
