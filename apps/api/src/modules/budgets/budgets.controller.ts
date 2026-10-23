import {
  Body,
  Controller,
  Get,
  Header,
  Headers,
  Param,
  Put,
  Query,
  ServiceUnavailableException,
  type Type,
} from "@nestjs/common";
import {
  budgetQuerySchema,
  budgetUpsertSchema,
  monthSchema,
  quotedVersionSchema,
} from "@joint/contracts";
import { financeContext, validateInput as valid } from "../../http-input.js";
import type { IdentityService } from "../identity/identity.service.js";
import type { ReportService } from "../reports/report.service.js";
import type { BudgetMutations } from "./budget-mutations.js";
interface Services {
  identity: IdentityService;
  reports: ReportService;
  budgets: BudgetMutations;
}
export function createBudgetsController(services?: Services): Type<unknown> {
  function use(): Services {
    if (!services) throw new ServiceUnavailableException();
    return services;
  }
  @Controller("v1/households/:householdId/budgets")
  class BudgetsController {
    @Get(":month")
    @Header("Cache-Control", "no-store")
    async read(
      @Headers("authorization") auth: string | undefined,
      @Param("householdId") hh: string,
      @Param("month") month: string,
      @Query() query: unknown,
    ) {
      const input = valid(budgetQuerySchema, query);
      return use().reports.read(
        await financeContext(use().identity, auth, hh),
        valid(monthSchema, month),
        input.accountIds,
      );
    }
    @Put(":month")
    @Header("Cache-Control", "no-store")
    async put(
      @Headers("authorization") auth: string | undefined,
      @Param("householdId") hh: string,
      @Param("month") month: string,
      @Headers("if-match") version: string | undefined,
      @Body() body: unknown,
    ) {
      return use().budgets.put(
        await financeContext(use().identity, auth, hh),
        valid(monthSchema, month),
        valid(budgetUpsertSchema, body),
        valid(quotedVersionSchema, version),
      );
    }
  }
  return BudgetsController;
}
