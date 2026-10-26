import {
  Body,
  Controller,
  Get,
  Header,
  Headers,
  Param,
  Put,
  Query,
  ServiceUnavailableException,
  type Type,
} from "@nestjs/common";
import {
  goalAllocationQuerySchema,
  goalAllocationWriteSchema,
  idempotencyKeySchema,
  quotedVersionSchema,
} from "@joint/contracts";
import { financeContext, validateInput as valid } from "../../../http-input.js";
import type { IdentityAccess } from "../../identity/identity.service.js";
import type { GoalAllocationService } from "./allocation.service.js";

export interface AllocationServices {
  identity: IdentityAccess;
  allocations: GoalAllocationService;
}
export function createAllocationController(
  services?: AllocationServices,
): Type<unknown> {
  function use(): AllocationServices {
    if (!services) throw new ServiceUnavailableException();
    return services;
  }
  @Controller("v1/households/:householdId/goals/:goalId/allocations")
  class AllocationController {
    @Put()
    @Header("Cache-Control", "no-store")
    async write(
      @Headers("authorization") auth: string | undefined,
      @Param("householdId") hh: string,
      @Param("goalId") id: string,
      @Headers("idempotency-key") key: string | undefined,
      @Headers("if-match") version: string | undefined,
      @Body() body: unknown,
    ) {
      return use().allocations.write(
        await financeContext(use().identity, auth, hh),
        valid(idempotencyKeySchema, id),
        valid(quotedVersionSchema, version),
        valid(goalAllocationWriteSchema, body),
        valid(idempotencyKeySchema, key),
      );
    }
    @Get()
    @Header("Cache-Control", "no-store")
    async read(
      @Headers("authorization") auth: string | undefined,
      @Param("householdId") hh: string,
      @Param("goalId") id: string,
      @Query() query: unknown,
    ) {
      const input = valid(goalAllocationQuerySchema, query);
      return use().allocations.read(
        await financeContext(use().identity, auth, hh),
        valid(idempotencyKeySchema, id),
        input.accountIds,
        input.cursor,
      );
    }
    @Get("export")
    @Header("Cache-Control", "no-store")
    @Header(
      "Content-Disposition",
      'attachment; filename="goal-allocations.json"',
    )
    async export(
      @Headers("authorization") auth: string | undefined,
      @Param("householdId") hh: string,
      @Param("goalId") id: string,
      @Query() query: unknown,
    ) {
      const input = valid(goalAllocationQuerySchema, query);
      return use().allocations.export(
        await financeContext(use().identity, auth, hh),
        valid(idempotencyKeySchema, id),
        input.accountIds,
        input.cursor,
      );
    }
  }
  return AllocationController;
}
