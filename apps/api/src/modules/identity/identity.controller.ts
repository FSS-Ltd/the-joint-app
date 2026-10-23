import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Header,
  Headers,
  HttpCode,
  Param,
  Post,
  ServiceUnavailableException,
  UnauthorizedException,
  type Type,
} from "@nestjs/common";
import {
  acceptInviteSchema,
  emptyObjectSchema,
  householdCreateSchema,
  idempotencyKeySchema,
  inviteSchema,
  logoutSchema,
  mfaCodeSchema,
  passwordResetSchema,
  recoverySchema,
  signInSchema,
  signUpSchema,
  verifyEmailSchema,
} from "@joint/contracts";
import type { IdentityService } from "./identity.service.js";
import type { HouseholdService } from "../households/households.service.js";

function validate<T>(
  schema: {
    safeParse(input: unknown): { success: true; data: T } | { success: false };
  },
  input: unknown,
): T {
  const result = schema.safeParse(input);
  if (!result.success)
    throw new BadRequestException({
      error: {
        code: "INVALID_INPUT",
        message: "Check the supplied fields and try again.",
      },
    });
  return result.data;
}
function sessionToken(header: string | undefined): string {
  if (!header?.startsWith("Session ")) throw new UnauthorizedException();
  const token = header.slice(8);
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) throw new UnauthorizedException();
  return token;
}
export function createIdentityController(
  service?: IdentityService,
  households?: HouseholdService,
): Type<unknown> {
  function identity(): IdentityService {
    if (!service) throw new ServiceUnavailableException();
    return service;
  }
  function householdService(): HouseholdService {
    if (!households) throw new ServiceUnavailableException();
    return households;
  }
  @Controller("v1")
  class IdentityController {
    @Post("auth/signup")
    @HttpCode(200)
    @Header("Cache-Control", "no-store")
    signup(@Body() body: unknown) {
      const value = validate(signUpSchema, body);
      return identity().signup(value.email, value.password);
    }
    @Post("auth/login")
    @HttpCode(200)
    @Header("Cache-Control", "no-store")
    login(@Body() body: unknown) {
      const value = validate(signInSchema, body);
      return identity().login(value.email, value.password);
    }
    @Post("auth/verify")
    @HttpCode(200)
    @Header("Cache-Control", "no-store")
    verify(@Body() body: unknown) {
      const value = validate(verifyEmailSchema, body);
      return identity().verify(value.email, value.code, value.type);
    }
    @Post("auth/recovery")
    @HttpCode(200)
    @Header("Cache-Control", "no-store")
    recovery(@Body() body: unknown) {
      const value = validate(recoverySchema, body);
      return identity().recovery(value.email);
    }
    @Get("me")
    @Header("Cache-Control", "no-store")
    me(@Headers("authorization") authorization: string | undefined) {
      return identity().me(sessionToken(authorization));
    }
    @Post("auth/password")
    @HttpCode(200)
    @Header("Cache-Control", "no-store")
    password(
      @Body() body: unknown,
      @Headers("authorization") authorization: string | undefined,
    ) {
      const value = validate(passwordResetSchema, body);
      return identity().password(sessionToken(authorization), value.password);
    }
    @Post("auth/mfa/enroll")
    @HttpCode(200)
    @Header("Cache-Control", "no-store")
    enroll(
      @Body() body: unknown,
      @Headers("authorization") authorization: string | undefined,
    ) {
      validate(emptyObjectSchema, body);
      return identity().enroll(sessionToken(authorization));
    }
    @Post("auth/mfa/verify")
    @HttpCode(200)
    @Header("Cache-Control", "no-store")
    verifyMfa(
      @Body() body: unknown,
      @Headers("authorization") authorization: string | undefined,
    ) {
      const value = validate(mfaCodeSchema, body);
      return identity().verifyMfa(
        sessionToken(authorization),
        value.factorId,
        value.code,
      );
    }
    @Post("auth/logout")
    @HttpCode(200)
    @Header("Cache-Control", "no-store")
    logout(
      @Body() body: unknown,
      @Headers("authorization") authorization: string | undefined,
    ) {
      const value = validate(logoutSchema, body);
      return identity().logout(sessionToken(authorization), value.scope);
    }
    @Post("households")
    @HttpCode(200)
    @Header("Cache-Control", "no-store")
    async createHousehold(
      @Body() body: unknown,
      @Headers("authorization") authorization: string | undefined,
      @Headers("idempotency-key") key: string | undefined,
    ) {
      const value = validate(householdCreateSchema, body);
      const requestKey = validate(idempotencyKeySchema, key);
      return householdService().create(
        await identity().actor(sessionToken(authorization)),
        value,
        requestKey,
      );
    }
    @Post("households/:householdId/invitations")
    @HttpCode(200)
    @Header("Cache-Control", "no-store")
    async invite(
      @Body() body: unknown,
      @Headers("authorization") authorization: string | undefined,
      @Headers("idempotency-key") key: string | undefined,
      @Param("householdId") householdId: string,
    ) {
      const value = validate(inviteSchema, body);
      const requestKey = validate(idempotencyKeySchema, key);
      const id = validate(idempotencyKeySchema, householdId);
      return householdService().invite(
        await identity().actor(sessionToken(authorization)),
        id,
        value.email,
        requestKey,
      );
    }
    @Post("invitations/accept")
    @HttpCode(200)
    @Header("Cache-Control", "no-store")
    async accept(
      @Body() body: unknown,
      @Headers("authorization") authorization: string | undefined,
    ) {
      const value = validate(acceptInviteSchema, body);
      return householdService().acceptInvite(
        await identity().actor(sessionToken(authorization)),
        value.token,
      );
    }
  }
  return IdentityController;
}
