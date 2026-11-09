import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Headers,
  HttpCode,
  Param,
  Patch,
  Post,
  ServiceUnavailableException,
  type Type,
} from "@nestjs/common";
import {
  categorisationRuleCreateSchema,
  categorisationRuleUpdateSchema,
  quotedVersionSchema,
} from "@joint/contracts";
import { financeContext, validateInput as valid } from "../../http-input.js";
import type { IdentityAccess } from "../identity/identity.service.js";
import type { CategorisationRulesService } from "./rules.service.js";

interface Services {
  identity: IdentityAccess;
  rules: CategorisationRulesService;
}

export function createCategorisationRulesController(
  services?: Services,
): Type<unknown> {
  function use(): Services {
    if (!services) throw new ServiceUnavailableException();
    return services;
  }

  @Controller("v1/households/:householdId/categorisation-rules")
  class CategorisationRulesController {
    @Get()
    @Header("Cache-Control", "no-store")
    async list(
      @Headers("authorization") auth: string | undefined,
      @Param("householdId") hh: string,
    ) {
      return use().rules.list(await financeContext(use().identity, auth, hh));
    }

    @Post()
    @Header("Cache-Control", "no-store")
    async create(
      @Headers("authorization") auth: string | undefined,
      @Param("householdId") hh: string,
      @Body() body: unknown,
    ) {
      const input = valid(categorisationRuleCreateSchema, body);
      return use().rules.create(
        await financeContext(use().identity, auth, hh),
        input,
      );
    }

    @Patch(":id")
    @Header("Cache-Control", "no-store")
    async update(
      @Headers("authorization") auth: string | undefined,
      @Param("householdId") hh: string,
      @Param("id") id: string,
      @Headers("if-match") version: string | undefined,
      @Body() body: unknown,
    ) {
      const expectedVersion = valid(quotedVersionSchema, version);
      const input = valid(categorisationRuleUpdateSchema, body);
      return use().rules.update(
        await financeContext(use().identity, auth, hh),
        id,
        input,
        expectedVersion,
      );
    }

    @Delete(":id")
    @HttpCode(204)
    @Header("Cache-Control", "no-store")
    async delete(
      @Headers("authorization") auth: string | undefined,
      @Param("householdId") hh: string,
      @Param("id") id: string,
    ) {
      await use().rules.delete(
        await financeContext(use().identity, auth, hh),
        id,
      );
    }
  }

  return CategorisationRulesController;
}
