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
import { accountListQuerySchema, idempotencyKeySchema } from "@joint/contracts";
import { ownerArchiveContext, validateInput } from "../../http-input.js";
import type { IdentityService } from "../identity/identity.service.js";
import type { ArchiveService } from "./archive.service.js";

interface Services {
  identity: IdentityService;
  archive: ArchiveService;
}
export function createArchiveController(services?: Services): Type<unknown> {
  function use(): Services {
    if (!services) throw new ServiceUnavailableException();
    return services;
  }
  @Controller("v1/me/archive/accounts")
  class ArchiveController {
    @Get()
    @Header("Cache-Control", "no-store")
    async list(
      @Headers("authorization") auth: string | undefined,
      @Query() query: unknown,
    ) {
      const page = validateInput(accountListQuerySchema, query);
      return use().archive.list(
        await ownerArchiveContext(use().identity, auth),
        page.limit,
        page.cursor,
      );
    }
    @Get(":accountId")
    @Header("Cache-Control", "no-store")
    async account(
      @Headers("authorization") auth: string | undefined,
      @Param("accountId") id: string,
    ) {
      return use().archive.read(
        await ownerArchiveContext(use().identity, auth),
        validateInput(idempotencyKeySchema, id),
      );
    }
    @Get(":accountId/transactions")
    @Header("Cache-Control", "no-store")
    async transactions(
      @Headers("authorization") auth: string | undefined,
      @Param("accountId") id: string,
      @Query() query: unknown,
    ) {
      const page = validateInput(accountListQuerySchema, query);
      return use().archive.transactions(
        await ownerArchiveContext(use().identity, auth),
        validateInput(idempotencyKeySchema, id),
        page.limit,
        page.cursor,
      );
    }
  }
  return ArchiveController;
}
