import {
  Body,
  Controller,
  Header,
  Headers,
  Param,
  Put,
  ServiceUnavailableException,
  type Type,
} from "@nestjs/common";
import {
  accountCoverageInputSchema,
  idempotencyKeySchema,
  monthSchema,
  quotedVersionSchema,
} from "@joint/contracts";
import { financeContext, validateInput as valid } from "../../http-input.js";
import type { IdentityAccess } from "../identity/identity.service.js";
import type { AccountCoverage } from "./account-coverage.js";
interface Services {
  identity: IdentityAccess;
  coverage: AccountCoverage;
}
export function createCoverageController(services?: Services): Type<unknown> {
  function use(): Services {
    if (!services) throw new ServiceUnavailableException();
    return services;
  }
  @Controller("v1/households/:householdId/accounts")
  class CoverageController {
    @Put(":id/coverage/:month")
    @Header("Cache-Control", "no-store")
    async put(
      @Headers("authorization") auth: string | undefined,
      @Param("householdId") hh: string,
      @Param("id") id: string,
      @Param("month") month: string,
      @Headers("if-match") version: string | undefined,
      @Body() body: unknown,
    ) {
      return use().coverage.put(
        await financeContext(use().identity, auth, hh),
        valid(idempotencyKeySchema, id),
        valid(monthSchema, month),
        valid(accountCoverageInputSchema, body).complete,
        valid(quotedVersionSchema, version),
      );
    }
  }
  return CoverageController;
}
