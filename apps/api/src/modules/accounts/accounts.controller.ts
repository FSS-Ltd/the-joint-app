import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Header,
  Headers,
  HttpCode,
  Param,
  Patch,
  Post,
  Put,
  Query,
  ServiceUnavailableException,
  UnauthorizedException,
  type Type,
} from "@nestjs/common";
import {
  accountCreateSchema,
  accountListQuerySchema,
  accountPatchSchema,
  grantInputSchema,
  idempotencyKeySchema,
  quotedVersionSchema,
  valuationInputSchema,
  type AuthContext,
} from "@joint/contracts";
import type { IdentityService } from "../identity/identity.service.js";
import type { AccountQueries } from "./account-queries.js";
import type { AccountMutations } from "./account-mutations.js";
import type { AccountGrants } from "./account-grants.js";

function validate<T>(
  schema: {
    safeParse(value: unknown): { success: true; data: T } | { success: false };
  },
  value: unknown,
): T {
  const result = schema.safeParse(value);
  if (!result.success) throw new BadRequestException();
  return result.data;
}
interface AccountServices {
  identity: IdentityService;
  queries: AccountQueries;
  mutations: AccountMutations;
  grants: AccountGrants;
}
export function createAccountsController(
  services?: AccountServices,
): Type<unknown> {
  function useServices(): AccountServices {
    if (!services) throw new ServiceUnavailableException();
    return services;
  }
  function context(
    header: string | undefined,
    householdId: string,
  ): Promise<AuthContext> {
    if (!header?.match(/^Session [A-Za-z0-9_-]{43}$/))
      throw new UnauthorizedException();
    return useServices().identity.financeContext(
      header.slice(8),
      validate(idempotencyKeySchema, householdId),
    );
  }
  @Controller("v1/households/:householdId/accounts")
  class AccountsController {
    @Get()
    @Header("Cache-Control", "no-store")
    async list(
      @Headers("authorization") auth: string | undefined,
      @Param("householdId") householdId: string,
      @Query() query: unknown,
    ) {
      const value = validate(accountListQuerySchema, query);
      return useServices().queries.list(
        await context(auth, householdId),
        value.limit,
        value.cursor,
      );
    }
    @Get(":accountId")
    @Header("Cache-Control", "no-store")
    async read(
      @Headers("authorization") auth: string | undefined,
      @Param("householdId") householdId: string,
      @Param("accountId") accountId: string,
    ) {
      return useServices().queries.read(
        await context(auth, householdId),
        validate(idempotencyKeySchema, accountId),
      );
    }
    @Post()
    @HttpCode(200)
    @Header("Cache-Control", "no-store")
    async create(
      @Headers("authorization") auth: string | undefined,
      @Param("householdId") householdId: string,
      @Headers("idempotency-key") key: string | undefined,
      @Body() body: unknown,
    ) {
      const input = validate(accountCreateSchema, body);
      const requestKey = validate(idempotencyKeySchema, key);
      return useServices().mutations.create(
        await context(auth, householdId),
        input,
        requestKey,
      );
    }
    @Patch(":accountId")
    @Header("Cache-Control", "no-store")
    async patch(
      @Headers("authorization") auth: string | undefined,
      @Param("householdId") householdId: string,
      @Param("accountId") accountId: string,
      @Headers("if-match") version: string | undefined,
      @Body() body: unknown,
    ) {
      const id = validate(idempotencyKeySchema, accountId);
      const input = validate(accountPatchSchema, body);
      const expected = validate(quotedVersionSchema, version);
      return useServices().mutations.patch(
        await context(auth, householdId),
        id,
        input,
        expected,
      );
    }
    @Post(":accountId/valuations")
    @HttpCode(200)
    @Header("Cache-Control", "no-store")
    async value(
      @Headers("authorization") auth: string | undefined,
      @Param("householdId") householdId: string,
      @Param("accountId") accountId: string,
      @Headers("if-match") version: string | undefined,
      @Headers("idempotency-key") key: string | undefined,
      @Body() body: unknown,
    ) {
      const id = validate(idempotencyKeySchema, accountId);
      const input = validate(valuationInputSchema, body);
      const expected = validate(quotedVersionSchema, version);
      const requestKey = validate(idempotencyKeySchema, key);
      return useServices().mutations.value(
        await context(auth, householdId),
        id,
        input,
        expected,
        requestKey,
      );
    }
    @Put(":accountId/grants/:membershipId")
    @Header("Cache-Control", "no-store")
    async grant(
      @Headers("authorization") auth: string | undefined,
      @Param("householdId") householdId: string,
      @Param("accountId") accountId: string,
      @Param("membershipId") membershipId: string,
      @Headers("if-match") version: string | undefined,
      @Body() body: unknown,
    ) {
      const id = validate(idempotencyKeySchema, accountId);
      const member = validate(idempotencyKeySchema, membershipId);
      const input = validate(grantInputSchema, body);
      const expected = validate(quotedVersionSchema, version);
      return useServices().grants.set(
        await context(auth, householdId),
        id,
        member,
        input.level,
        expected,
      );
    }
  }
  return AccountsController;
}
