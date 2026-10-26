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
  goalAllocationQuerySchema,
  idempotencyKeySchema,
} from "@joint/contracts";
import {
  ownerArchiveContext,
  validateInput as valid,
} from "../../../http-input.js";
import type { AllocationServices } from "./allocation.controller.js";

export function createAllocationArchiveController(
  services?: AllocationServices,
): Type<unknown> {
  function use(): AllocationServices {
    if (!services) throw new ServiceUnavailableException();
    return services;
  }
  @Controller("v1/me/archive/goals/:goalId/allocations")
  class AllocationArchiveController {
    @Get()
    @Header("Cache-Control", "no-store")
    async read(
      @Headers("authorization") auth: string | undefined,
      @Param("goalId") id: string,
      @Query() query: unknown,
    ) {
      const input = valid(goalAllocationQuerySchema, query);
      return use().allocations.readArchive(
        await ownerArchiveContext(use().identity, auth),
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
      @Param("goalId") id: string,
      @Query() query: unknown,
    ) {
      const input = valid(goalAllocationQuerySchema, query);
      return use().allocations.exportArchive(
        await ownerArchiveContext(use().identity, auth),
        valid(idempotencyKeySchema, id),
        input.accountIds,
        input.cursor,
      );
    }
  }
  return AllocationArchiveController;
}
