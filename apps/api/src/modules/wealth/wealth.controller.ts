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
import { wealthQuerySchema, type WealthSummaryDto } from "@joint/contracts";
import { financeContext, validateInput } from "../../http-input.js";
import type { IdentityAccess } from "../identity/identity.service.js";
import type { WealthService } from "./wealth.service.js";
interface Services {
  identity: IdentityAccess;
  wealth: WealthService;
}
export function createWealthController(services?: Services): Type<unknown> {
  @Controller("v1/households/:householdId/wealth")
  class WealthController {
    @Get()
    @Header("Cache-Control", "no-store")
    async read(
      @Headers("authorization") auth: string | undefined,
      @Param("householdId") householdId: string,
      @Query() query: unknown,
    ): Promise<WealthSummaryDto> {
      if (!services) throw new ServiceUnavailableException();
      const input = validateInput(wealthQuerySchema, query);
      return services.wealth.read(
        await financeContext(services.identity, auth, householdId),
        input.accountIds,
      );
    }
  }
  return WealthController;
}
