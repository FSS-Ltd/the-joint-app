import type { ServerResponse } from "node:http";
import {
  Body,
  Controller,
  Get,
  Header,
  Headers,
  HttpCode,
  Param,
  Post,
  Res,
  ServiceUnavailableException,
  type Type,
} from "@nestjs/common";
import { exportScopeSchema, idempotencyKeySchema } from "@joint/contracts";
import {
  financeContext,
  ownerArchiveContext,
  validateInput,
} from "../../http-input.js";
import type { IdentityAccess } from "../identity/identity.service.js";
import type { ExportService } from "./export.service.js";

import { streamDownload } from "./export-stream.js";

interface Services {
  identity: IdentityAccess;
  exports: ExportService;
}
function required(services: Services | undefined): Services {
  if (!services) throw new ServiceUnavailableException();
  return services;
}
export function createExportsController(services?: Services): Type<unknown> {
  @Controller("v1/households/:householdId/exports")
  class ExportsController {
    @Post()
    @HttpCode(202)
    @Header("Cache-Control", "no-store")
    async request(
      @Headers("authorization") auth: string | undefined,
      @Param("householdId") hh: string,
      @Body() body: unknown,
    ) {
      const use = required(services);
      return use.exports.requestExport(
        await financeContext(use.identity, auth, hh),
        validateInput(exportScopeSchema, body),
      );
    }
    @Get(":id")
    @Header("Cache-Control", "no-store")
    async status(
      @Headers("authorization") auth: string | undefined,
      @Param("householdId") hh: string,
      @Param("id") id: string,
    ) {
      const use = required(services);
      return use.exports.status(
        await financeContext(use.identity, auth, hh),
        validateInput(idempotencyKeySchema, id),
      );
    }
    @Get(":id/download")
    @Header("Cache-Control", "no-store")
    @Header("X-Content-Type-Options", "nosniff")
    async download(
      @Headers("authorization") auth: string | undefined,
      @Param("householdId") hh: string,
      @Param("id") id: string,
      @Headers("range") range: string | undefined,
      @Res({ passthrough: true }) response: ServerResponse,
    ) {
      const use = required(services),
        signal = new AbortController();
      const chunks = await use.exports.download(
        await financeContext(use.identity, auth, hh),
        validateInput(idempotencyKeySchema, id),
        range,
        signal.signal,
      );
      return streamDownload(response, signal, chunks);
    }
  }
  return ExportsController;
}
export function createArchiveExportsController(
  services?: Services,
): Type<unknown> {
  @Controller("v1/me/archive/exports")
  class ArchiveExportsController {
    @Post()
    @HttpCode(202)
    @Header("Cache-Control", "no-store")
    async request(
      @Headers("authorization") auth: string | undefined,
      @Body() body: unknown,
    ) {
      const use = required(services);
      return use.exports.requestArchiveExport(
        await ownerArchiveContext(use.identity, auth),
        validateInput(exportScopeSchema, body),
      );
    }
    @Get(":id")
    @Header("Cache-Control", "no-store")
    async status(
      @Headers("authorization") auth: string | undefined,
      @Param("id") id: string,
    ) {
      const use = required(services);
      return use.exports.archiveStatus(
        await ownerArchiveContext(use.identity, auth),
        validateInput(idempotencyKeySchema, id),
      );
    }
    @Get(":id/download")
    @Header("Cache-Control", "no-store")
    @Header("X-Content-Type-Options", "nosniff")
    async download(
      @Headers("authorization") auth: string | undefined,
      @Param("id") id: string,
      @Headers("range") range: string | undefined,
      @Res({ passthrough: true }) response: ServerResponse,
    ) {
      const use = required(services),
        signal = new AbortController();
      const chunks = await use.exports.downloadArchive(
        await ownerArchiveContext(use.identity, auth),
        validateInput(idempotencyKeySchema, id),
        range,
        signal.signal,
      );
      return streamDownload(response, signal, chunks);
    }
  }
  return ArchiveExportsController;
}
