import {
  Body,
  Controller,
  Get,
  Header,
  Headers,
  Param,
  Post,
  Query,
  ServiceUnavailableException,
  type Type,
} from "@nestjs/common";
import {
  fundingEvidenceWriteSchema,
  fundingEvidenceQuerySchema,
  idempotencyKeySchema,
  quotedVersionSchema,
} from "@joint/contracts";
import { financeContext, validateInput as valid } from "../../http-input.js";
import type { IdentityService } from "../identity/identity.service.js";
import type { FundingEvidenceService } from "./funding-evidence.service.js";
export interface FundingEvidenceServices {
  identity: IdentityService;
  funding: FundingEvidenceService;
}
export function createFundingEvidenceController(
  services?: FundingEvidenceServices,
): Type<unknown> {
  function use(): FundingEvidenceServices {
    if (!services) throw new ServiceUnavailableException();
    return services;
  }
  @Controller("v1/households/:householdId/accounts/:accountId/funding-evidence")
  class FundingEvidenceController {
    @Post()
    @Header("Cache-Control", "no-store")
    async write(
      @Headers("authorization") auth: string | undefined,
      @Param("householdId") hh: string,
      @Param("accountId") id: string,
      @Headers("idempotency-key") key: string | undefined,
      @Headers("if-match") version: string | undefined,
      @Body() body: unknown,
    ) {
      return use().funding.write(
        await financeContext(use().identity, auth, hh),
        valid(idempotencyKeySchema, id),
        valid(quotedVersionSchema, version),
        valid(fundingEvidenceWriteSchema, body),
        valid(idempotencyKeySchema, key),
      );
    }
    @Get()
    @Header("Cache-Control", "no-store")
    async read(
      @Headers("authorization") auth: string | undefined,
      @Param("householdId") hh: string,
      @Param("accountId") id: string,
      @Query() query: unknown,
    ) {
      const input = valid(fundingEvidenceQuerySchema, query);
      return use().funding.read(
        await financeContext(use().identity, auth, hh),
        valid(idempotencyKeySchema, id),
        input.cursor,
      );
    }
    @Get("export")
    @Header("Cache-Control", "no-store")
    @Header(
      "Content-Disposition",
      'attachment; filename="funding-evidence.json"',
    )
    async export(
      @Headers("authorization") auth: string | undefined,
      @Param("householdId") hh: string,
      @Param("accountId") id: string,
      @Query() query: unknown,
    ) {
      const input = valid(fundingEvidenceQuerySchema, query);
      return use().funding.export(
        await financeContext(use().identity, auth, hh),
        valid(idempotencyKeySchema, id),
        input.cursor,
      );
    }
  }
  return FundingEvidenceController;
}
