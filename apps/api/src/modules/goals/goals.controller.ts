import {
  Body,
  Controller,
  Get,
  Header,
  Headers,
  Param,
  Put,
  Post,
  Query,
  ServiceUnavailableException,
  type Type,
} from "@nestjs/common";
import {
  goalWriteSchema,
  goalPageQuerySchema,
  goalListQuerySchema,
  idempotencyKeySchema,
  quotedVersionSchema,
} from "@joint/contracts";
import { financeContext, validateInput as valid } from "../../http-input.js";
import type { IdentityAccess } from "../identity/identity.service.js";
import type { GoalService } from "./goals.service.js";
export interface GoalServices {
  identity: IdentityAccess;
  goals: GoalService;
}
export function createGoalsController(services?: GoalServices): Type<unknown> {
  function use(): GoalServices {
    if (!services) throw new ServiceUnavailableException();
    return services;
  }
  @Controller("v1/households/:householdId/goals")
  class GoalsController {
    @Get()
    @Header("Cache-Control", "no-store")
    async list(
      @Headers("authorization") auth: string | undefined,
      @Param("householdId") hh: string,
      @Query() query: unknown,
    ) {
      const input = valid(goalListQuerySchema, query);
      return use().goals.list(
        await financeContext(use().identity, auth, hh),
        input.cursor,
      );
    }
    @Get(":goalId")
    @Header("Cache-Control", "no-store")
    async read(
      @Headers("authorization") auth: string | undefined,
      @Param("householdId") hh: string,
      @Param("goalId") id: string,
      @Query() query: unknown,
    ) {
      const input = valid(goalPageQuerySchema, query);
      return use().goals.read(
        await financeContext(use().identity, auth, hh),
        valid(idempotencyKeySchema, id),
        input.cursor,
      );
    }
    @Post()
    @Header("Cache-Control", "no-store")
    async create(
      @Headers("authorization") auth: string | undefined,
      @Param("householdId") hh: string,
      @Headers("idempotency-key") key: string | undefined,
      @Body() body: unknown,
    ) {
      return use().goals.create(
        await financeContext(use().identity, auth, hh),
        valid(goalWriteSchema, body),
        valid(idempotencyKeySchema, key),
      );
    }
    @Put(":goalId")
    @Header("Cache-Control", "no-store")
    async write(
      @Headers("authorization") auth: string | undefined,
      @Param("householdId") hh: string,
      @Param("goalId") id: string,
      @Headers("if-match") version: string | undefined,
      @Body() body: unknown,
    ) {
      return use().goals.write(
        await financeContext(use().identity, auth, hh),
        valid(idempotencyKeySchema, id),
        valid(
          quotedVersionSchema.refine((value) => value > 0),
          version,
        ),
        valid(goalWriteSchema, body),
      );
    }
    @Get(":goalId/export")
    @Header("Cache-Control", "no-store")
    @Header("Content-Disposition", 'attachment; filename="goal-history.json"')
    async export(
      @Headers("authorization") auth: string | undefined,
      @Param("householdId") hh: string,
      @Param("goalId") id: string,
      @Query() query: unknown,
    ) {
      const input = valid(goalPageQuerySchema, query);
      return use().goals.export(
        await financeContext(use().identity, auth, hh),
        valid(idempotencyKeySchema, id),
        input.cursor,
      );
    }
  }
  return GoalsController;
}
