import { readIdentityToken } from "../../identity-header.js";
import {
  BadRequestException,
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
  emptyObjectSchema,
  idempotencyKeySchema,
  type EntitlementResponse,
} from "@joint/contracts";
import type { IdentityAccess } from "../identity/identity.service.js";
import type { EntitlementService } from "./entitlement.service.js";

interface EntitlementServices {
  identity: IdentityAccess;
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
      const id = idempotencyKeySchema.safeParse(householdId);
      if (!id.success || !emptyObjectSchema.safeParse(query).success)
        throw new BadRequestException();
      if (!services) throw new ServiceUnavailableException();
      const context = await services.identity.financeContext(
        readIdentityToken(auth),
        id.data,
      );
      return services.entitlements.read(context);
    }
  }
  return EntitlementsController;
}
