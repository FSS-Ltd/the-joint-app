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
  fundingEvidenceQuerySchema,
  idempotencyKeySchema,
} from "@joint/contracts";
import {
  ownerArchiveContext,
  validateInput as valid,
} from "../../http-input.js";
import type { FundingEvidenceServices } from "./funding-evidence.controller.js";
export function createFundingArchiveController(
  services?: FundingEvidenceServices,
): Type<unknown> {
  function use(): FundingEvidenceServices {
    if (!services) throw new ServiceUnavailableException();
    return services;
  }
  @Controller("v1/me/archive/accounts/:accountId/funding-evidence")
  class FundingArchiveController {
    @Get()
    @Header("Cache-Control", "no-store")
    async read(
      @Headers("authorization") auth: string | undefined,
      @Param("accountId") id: string,
      @Query() query: unknown,
    ) {
      const input = valid(fundingEvidenceQuerySchema, query);
      return use().funding.readArchive(
        await ownerArchiveContext(use().identity, auth),
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
      @Param("accountId") id: string,
      @Query() query: unknown,
    ) {
      const input = valid(fundingEvidenceQuerySchema, query);
      return use().funding.exportArchive(
        await ownerArchiveContext(use().identity, auth),
        valid(idempotencyKeySchema, id),
        input.cursor,
      );
    }
  }
  return FundingArchiveController;
}
