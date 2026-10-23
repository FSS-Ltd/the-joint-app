import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Headers,
  HttpCode,
  Param,
  Post,
  ServiceUnavailableException,
  type Type,
} from "@nestjs/common";
import {
  idempotencyKeySchema,
  transferConfirmSchema,
  transferRemoveSchema,
} from "@joint/contracts";
import { financeContext, validateInput as valid } from "../../http-input.js";
import type { IdentityService } from "../identity/identity.service.js";
import type { TransfersService } from "./transfers.service.js";
interface Services {
  identity: IdentityService;
  transfers: TransfersService;
}
export function createTransfersController(services?: Services): Type<unknown> {
  function use(): Services {
    if (!services) throw new ServiceUnavailableException();
    return services;
  }
  @Controller("v1/households/:householdId/transfers")
  class TransfersController {
    @Post("confirm")
    @HttpCode(200)
    @Header("Cache-Control", "no-store")
    async confirm(
      @Headers("authorization") auth: string | undefined,
      @Param("householdId") hh: string,
      @Headers("idempotency-key") key: string | undefined,
      @Body() body: unknown,
    ) {
      return use().transfers.confirm(
        await financeContext(use().identity, auth, hh),
        valid(transferConfirmSchema, body),
        valid(idempotencyKeySchema, key),
      );
    }
    @Get(":id")
    @Header("Cache-Control", "no-store")
    async read(
      @Headers("authorization") auth: string | undefined,
      @Param("householdId") hh: string,
      @Param("id") id: string,
    ) {
      return use().transfers.read(
        await financeContext(use().identity, auth, hh),
        valid(idempotencyKeySchema, id),
      );
    }
    @Delete(":id")
    @HttpCode(200)
    @Header("Cache-Control", "no-store")
    async remove(
      @Headers("authorization") auth: string | undefined,
      @Param("householdId") hh: string,
      @Param("id") id: string,
      @Body() body: unknown,
    ) {
      return use().transfers.remove(
        await financeContext(use().identity, auth, hh),
        valid(idempotencyKeySchema, id),
        valid(transferRemoveSchema, body),
      );
    }
  }
  return TransfersController;
}
