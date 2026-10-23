import {
  BadRequestException,
  Controller,
  Get,
  Header,
  Headers,
  Param,
  Query,
  ServiceUnavailableException,
  UnauthorizedException,
  type Type,
} from "@nestjs/common";
import {
  emptyObjectSchema,
  idempotencyKeySchema,
  type EntitlementResponse,
} from "@joint/contracts";
import type { IdentityService } from "../identity/identity.service.js";
import type { EntitlementService } from "./entitlement.service.js";

interface EntitlementServices {
  identity: IdentityService;
  entitlements: EntitlementService;
}
export function createEntitlementsController(
  services?: EntitlementServices,
): Type<unknown> {
  @Controller("v1/households/:householdId/entitlements")
  class EntitlementsController {
    @Get()
    @Header("Cache-Control", "no-store")
    async read(
      @Headers("authorization") auth: string | undefined,
      @Param("householdId") householdId: string,
      @Query() query: unknown,
    ): Promise<EntitlementResponse> {
      if (!auth?.match(/^Session [A-Za-z0-9_-]{43}$/))
        throw new UnauthorizedException();
      const id = idempotencyKeySchema.safeParse(householdId);
      if (!id.success || !emptyObjectSchema.safeParse(query).success)
        throw new BadRequestException();
      if (!services) throw new ServiceUnavailableException();
      const context = await services.identity.financeContext(
        auth.slice(8),
        id.data,
      );
      return services.entitlements.read(context);
    }
  }
  return EntitlementsController;
}
