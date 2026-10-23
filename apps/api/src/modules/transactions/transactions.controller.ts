import {
  Body,
  Controller,
  Get,
  Header,
  Headers,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  ServiceUnavailableException,
  type Type,
} from "@nestjs/common";
import {
  idempotencyKeySchema,
  quotedVersionSchema,
  transactionAnnotationSchema,
  transactionCreateSchema,
  transactionListQuerySchema,
  transactionPatchSchema,
} from "@joint/contracts";
import type { IdentityService } from "../identity/identity.service.js";
import { financeContext, validateInput as valid } from "../../http-input.js";
import type { TransactionQueries } from "./transaction-queries.js";
import type { TransactionMutations } from "./transaction-mutations.js";
import type { TransactionAnnotations } from "./transaction-annotations.js";

interface Services {
  identity: IdentityService;
  queries: TransactionQueries;
  mutations: TransactionMutations;
  annotations: TransactionAnnotations;
}
export function createTransactionsController(
  services?: Services,
): Type<unknown> {
  function use(): Services {
    if (!services) throw new ServiceUnavailableException();
    return services;
  }
  @Controller("v1/households/:householdId/transactions")
  class TransactionsController {
    @Get()
    @Header("Cache-Control", "no-store")
    async list(
      @Headers("authorization") auth: string | undefined,
      @Param("householdId") hh: string,
      @Query() query: unknown,
    ) {
      const input = valid(transactionListQuerySchema, query);
      return use().queries.list(
        await financeContext(use().identity, auth, hh),
        input.accountId,
        input.limit,
        input.cursor,
      );
    }
    @Get(":id")
    @Header("Cache-Control", "no-store")
    async read(
      @Headers("authorization") auth: string | undefined,
      @Param("householdId") hh: string,
      @Param("id") id: string,
    ) {
      return use().queries.read(
        await financeContext(use().identity, auth, hh),
        valid(idempotencyKeySchema, id),
      );
    }
    @Post()
    @HttpCode(200)
    @Header("Cache-Control", "no-store")
    async create(
      @Headers("authorization") auth: string | undefined,
      @Param("householdId") hh: string,
      @Headers("idempotency-key") key: string | undefined,
      @Body() body: unknown,
    ) {
      const input = valid(transactionCreateSchema, body),
        requestKey = valid(idempotencyKeySchema, key);
      return use().mutations.create(
        await financeContext(use().identity, auth, hh),
        input,
        requestKey,
      );
    }
    @Patch(":id")
    @Header("Cache-Control", "no-store")
    async patch(
      @Headers("authorization") auth: string | undefined,
      @Param("householdId") hh: string,
      @Param("id") id: string,
      @Headers("if-match") version: string | undefined,
      @Body() body: unknown,
    ) {
      const input = valid(transactionPatchSchema, body),
        expected = valid(quotedVersionSchema, version),
        uuid = valid(idempotencyKeySchema, id);
      return use().mutations.patch(
        await financeContext(use().identity, auth, hh),
        uuid,
        input,
        expected,
      );
    }
    @Patch(":id/annotation")
    @Header("Cache-Control", "no-store")
    async annotation(
      @Headers("authorization") auth: string | undefined,
      @Param("householdId") hh: string,
      @Param("id") id: string,
      @Headers("if-match") version: string | undefined,
      @Body() body: unknown,
    ) {
      const input = valid(transactionAnnotationSchema, body),
        expected = valid(quotedVersionSchema, version),
        uuid = valid(idempotencyKeySchema, id);
      return use().annotations.annotate(
        await financeContext(use().identity, auth, hh),
        uuid,
        input,
        expected,
      );
    }
  }
  return TransactionsController;
}
