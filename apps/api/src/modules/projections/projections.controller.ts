import {
  Body,
  Controller,
  Get,
  Header,
  Headers,
  Param,
  Post,
  ServiceUnavailableException,
  type Type,
} from "@nestjs/common";
import {
  createBasicProjectionRunRequestSchema,
  createScenarioRequestSchema,
  createAdvancedProjectionRunRequestSchema,
  basicProjectionInputSchema,
  advancedProjectionInputSchema,
  idempotencyKeySchema,
} from "@joint/contracts";
import { financeContext, validateInput as valid } from "../../http-input.js";
import type { IdentityAccess } from "../identity/identity.service.js";
import type { ProjectionsService } from "./projections.service.js";

export interface ProjectionServices {
  identity: IdentityAccess;
  projections: ProjectionsService;
}

export function createProjectionsController(
  services?: ProjectionServices,
): Type<unknown> {
  function use(): ProjectionServices {
    if (!services) throw new ServiceUnavailableException();
    return services;
  }

  @Controller("v1/households/:householdId")
  class ProjectionsController {
    // 1. Basic projection runs
    @Post("projections/basic")
    @Header("Cache-Control", "no-store")
    async createBasicRunRoot(
      @Headers("authorization") auth: string | undefined,
      @Param("householdId") hh: string,
      @Headers("idempotency-key") key: string | undefined,
      @Body() body: unknown,
    ) {
      const data = valid(createBasicProjectionRunRequestSchema, body);
      return use().projections.createBasicRun(
        await financeContext(use().identity, auth, hh),
        data.goalId,
        data.input,
        valid(idempotencyKeySchema, key),
      );
    }

    @Post("goals/:goalId/projections/basic")
    @Header("Cache-Control", "no-store")
    async createBasicRunForGoal(
      @Headers("authorization") auth: string | undefined,
      @Param("householdId") hh: string,
      @Param("goalId") goalId: string,
      @Headers("idempotency-key") key: string | undefined,
      @Body() body: unknown,
    ) {
      const input = valid(
        basicProjectionInputSchema,
        typeof body === "object" && body !== null && "input" in body
          ? (body as { input: unknown }).input
          : body,
      );
      return use().projections.createBasicRun(
        await financeContext(use().identity, auth, hh),
        valid(idempotencyKeySchema, goalId),
        input,
        valid(idempotencyKeySchema, key),
      );
    }

    // 2. Scenarios
    @Post("scenarios")
    @Header("Cache-Control", "no-store")
    async createScenarioRoot(
      @Headers("authorization") auth: string | undefined,
      @Param("householdId") hh: string,
      @Headers("idempotency-key") key: string | undefined,
      @Body() body: unknown,
    ) {
      const data = valid(createScenarioRequestSchema, body);
      return use().projections.createScenario(
        await financeContext(use().identity, auth, hh),
        data.goalId,
        data.input,
        valid(idempotencyKeySchema, key),
      );
    }

    @Post("goals/:goalId/scenarios")
    @Header("Cache-Control", "no-store")
    async createScenarioForGoal(
      @Headers("authorization") auth: string | undefined,
      @Param("householdId") hh: string,
      @Param("goalId") goalId: string,
      @Headers("idempotency-key") key: string | undefined,
      @Body() body: unknown,
    ) {
      const input = valid(
        advancedProjectionInputSchema,
        typeof body === "object" && body !== null && "input" in body
          ? (body as { input: unknown }).input
          : body,
      );
      return use().projections.createScenario(
        await financeContext(use().identity, auth, hh),
        valid(idempotencyKeySchema, goalId),
        input,
        valid(idempotencyKeySchema, key),
      );
    }

    @Get("scenarios/:scenarioId")
    @Header("Cache-Control", "no-store")
    async readScenario(
      @Headers("authorization") auth: string | undefined,
      @Param("householdId") hh: string,
      @Param("scenarioId") scenarioId: string,
    ) {
      return use().projections.readScenario(
        await financeContext(use().identity, auth, hh),
        valid(idempotencyKeySchema, scenarioId),
      );
    }

    @Get("goals/:goalId/scenarios")
    @Header("Cache-Control", "no-store")
    async listScenarios(
      @Headers("authorization") auth: string | undefined,
      @Param("householdId") hh: string,
      @Param("goalId") goalId: string,
    ) {
      return use().projections.listScenarios(
        await financeContext(use().identity, auth, hh),
        valid(idempotencyKeySchema, goalId),
      );
    }

    // 3. Advanced projection runs
    @Post("projections")
    @Header("Cache-Control", "no-store")
    async createAdvancedRunRoot(
      @Headers("authorization") auth: string | undefined,
      @Param("householdId") hh: string,
      @Headers("idempotency-key") key: string | undefined,
      @Body() body: unknown,
    ) {
      const data = valid(createAdvancedProjectionRunRequestSchema, body);
      return use().projections.createAdvancedRun(
        await financeContext(use().identity, auth, hh),
        data.goalId,
        data.scenarioId,
        valid(idempotencyKeySchema, key),
      );
    }

    @Post("goals/:goalId/projections")
    @Header("Cache-Control", "no-store")
    async createAdvancedRunForGoal(
      @Headers("authorization") auth: string | undefined,
      @Param("householdId") hh: string,
      @Param("goalId") goalId: string,
      @Headers("idempotency-key") key: string | undefined,
      @Body() body: unknown,
    ) {
      const scenarioId =
        typeof body === "object" && body !== null && "scenarioId" in body
          ? (body as { scenarioId: unknown }).scenarioId
          : undefined;
      return use().projections.createAdvancedRun(
        await financeContext(use().identity, auth, hh),
        valid(idempotencyKeySchema, goalId),
        valid(idempotencyKeySchema, scenarioId),
        valid(idempotencyKeySchema, key),
      );
    }

    @Get("projections/:projectionId")
    @Header("Cache-Control", "no-store")
    async readProjection(
      @Headers("authorization") auth: string | undefined,
      @Param("householdId") hh: string,
      @Param("projectionId") projectionId: string,
    ) {
      return use().projections.readRun(
        await financeContext(use().identity, auth, hh),
        valid(idempotencyKeySchema, projectionId),
      );
    }

    @Get("goals/:goalId/projections")
    @Header("Cache-Control", "no-store")
    async listProjections(
      @Headers("authorization") auth: string | undefined,
      @Param("householdId") hh: string,
      @Param("goalId") goalId: string,
    ) {
      return use().projections.listRuns(
        await financeContext(use().identity, auth, hh),
        valid(idempotencyKeySchema, goalId),
      );
    }
  }

  return ProjectionsController;
}
