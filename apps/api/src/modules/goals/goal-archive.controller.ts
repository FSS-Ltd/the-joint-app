import {
  Controller,
  Get,
  Header,
  Headers,
  Param,
  Query,
  ServiceUnavailableException,
  type Type,
} from "@nestjs/common";
import {
  goalPageQuerySchema,
  goalListQuerySchema,
  idempotencyKeySchema,
} from "@joint/contracts";
import {
  ownerArchiveContext,
  validateInput as valid,
} from "../../http-input.js";
import type { GoalServices } from "./goals.controller.js";
export function createGoalArchiveController(
  services?: GoalServices,
): Type<unknown> {
  function use(): GoalServices {
    if (!services) throw new ServiceUnavailableException();
    return services;
  }
  @Controller("v1/me/archive/goals")
  class GoalArchiveController {
    @Get()
    @Header("Cache-Control", "no-store")
    async list(
      @Headers("authorization") auth: string | undefined,
      @Query() query: unknown,
    ) {
      const input = valid(goalListQuerySchema, query);
      return use().goals.listArchive(
        await ownerArchiveContext(use().identity, auth),
        input.cursor,
      );
    }
    @Get(":goalId")
    @Header("Cache-Control", "no-store")
    async read(
      @Headers("authorization") auth: string | undefined,
      @Param("goalId") id: string,
      @Query() query: unknown,
    ) {
      const input = valid(goalPageQuerySchema, query);
      return use().goals.readArchive(
        await ownerArchiveContext(use().identity, auth),
        valid(idempotencyKeySchema, id),
        input.cursor,
      );
    }
    @Get(":goalId/export")
    @Header("Cache-Control", "no-store")
    @Header("Content-Disposition", 'attachment; filename="goal-history.json"')
    async export(
      @Headers("authorization") auth: string | undefined,
      @Param("goalId") id: string,
      @Query() query: unknown,
    ) {
      const input = valid(goalPageQuerySchema, query);
      return use().goals.exportArchive(
        await ownerArchiveContext(use().identity, auth),
        valid(idempotencyKeySchema, id),
        input.cursor,
      );
    }
  }
  return GoalArchiveController;
}
