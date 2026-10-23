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
  UnauthorizedException,
  type Type,
} from "@nestjs/common";
import {
  deletionRequestSchema,
  idempotencyKeySchema,
  leaveHouseholdSchema,
} from "@joint/contracts";
import type { PrivacyJournal } from "@joint/database/privacy-journal";
import {
  financeContext,
  ownerArchiveContext,
  validateInput,
} from "../../http-input.js";
import type { IdentityAccess } from "../identity/identity.service.js";
import type { LeaveService } from "./leave.service.js";
import type { PrivacyService } from "./privacy.service.js";

interface PrivacyServices {
  identity: IdentityAccess;
  privacy: PrivacyService;
}
interface LeaveServices {
  identity: IdentityAccess;
  leave: LeaveService;
  journal?: PrivacyJournal;
}

export function createPrivacyController(
  services?: PrivacyServices,
): Type<unknown> {
  function use(): PrivacyServices {
    if (!services) throw new ServiceUnavailableException();
    return services;
  }
  @Controller("v1/privacy/deletion-requests")
  class PrivacyController {
    @Post()
    @HttpCode(202)
    @Header("Cache-Control", "no-store")
    async request(
      @Headers("authorization") auth: string | undefined,
      @Body() body: unknown,
    ) {
      const input = validateInput(deletionRequestSchema, body);
      const active = use();
      return active.privacy.request(
        await ownerArchiveContext(active.identity, auth),
        input.requestId,
      );
    }
    @Get(":id")
    @Header("Cache-Control", "no-store")
    async status(
      @Headers("authorization") auth: string | undefined,
      @Param("id") id: string,
    ) {
      if (!auth || !/^Deletion [A-Za-z0-9_-]{43}$/.test(auth))
        throw new UnauthorizedException();
      return use().privacy.status(
        validateInput(idempotencyKeySchema, id),
        auth.slice(9),
      );
    }
  }
  return PrivacyController;
}

export function createLeaveController(services?: LeaveServices): Type<unknown> {
  @Controller("v1/households/:householdId/memberships/me")
  class LeaveController {
    @Delete()
    @Header("Cache-Control", "no-store")
    async leave(
      @Headers("authorization") auth: string | undefined,
      @Param("householdId") householdId: string,
      @Body() body: unknown,
    ) {
      const input = validateInput(leaveHouseholdSchema, body);
      if (!services?.journal)
        throw new ServiceUnavailableException({
          error: { code: "PRIVACY_UNAVAILABLE" },
        });
      await services.leave.leaveWithJournal(
        await financeContext(services.identity, auth, householdId),
        input.requestId,
        services.journal,
      );
      return { left: true };
    }
  }
  return LeaveController;
}
