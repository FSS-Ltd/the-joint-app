import {
  Controller,
  Get,
  Header,
  Headers,
  Query,
  ServiceUnavailableException,
  Param,
  type Type,
} from "@nestjs/common";
import {
  spendingQuerySchema,
  categoryQuerySchema,
  recurringQuerySchema,
  baselinesQuerySchema,
} from "@joint/contracts";
import { financeContext, validateInput as valid } from "../../http-input.js";
import type { IdentityAccess } from "../identity/identity.service.js";
import type { CategoriesService } from "../categories/category.service.js";
import type { ReportService } from "./report.service.js";
import type { RecurringCostsService } from "./recurring-costs.service.js";
import type { BaselinesService } from "./baselines.service.js";

interface Services {
  identity: IdentityAccess;
  reports: ReportService;
  categories: CategoriesService;
  recurring?: RecurringCostsService;
  baselines?: BaselinesService;
}
export function createReportsController(services?: Services): Type<unknown> {
  function use(): Services {
    if (!services) throw new ServiceUnavailableException();
    return services;
  }
  @Controller("v1/households/:householdId")
  class ReportsController {
    @Get("reports/spending")
    @Header("Cache-Control", "no-store")
    async spending(
      @Headers("authorization") auth: string | undefined,
      @Param("householdId") hh: string,
      @Query() query: unknown,
    ) {
      const input = valid(spendingQuerySchema, query);
      return use().reports.read(
        await financeContext(use().identity, auth, hh),
        input.month,
        input.accountIds,
      );
    }
    @Get("categories")
    @Header("Cache-Control", "no-store")
    async categories(
      @Headers("authorization") auth: string | undefined,
      @Param("householdId") hh: string,
      @Query() query: unknown,
    ) {
      const input = valid(categoryQuerySchema, query);
      return use().categories.list(
        await financeContext(use().identity, auth, hh),
        input.accountIds,
      );
    }

    @Get("recurring-costs")
    @Header("Cache-Control", "no-store")
    async recurringCosts(
      @Headers("authorization") auth: string | undefined,
      @Param("householdId") hh: string,
      @Query() query: unknown,
    ) {
      const input = valid(recurringQuerySchema, query);
      const service = use().recurring;
      if (!service) throw new ServiceUnavailableException();
      return service.read(
        await financeContext(use().identity, auth, hh),
        input.accountIds,
      );
    }

    @Get("reports/baselines")
    @Header("Cache-Control", "no-store")
    async baselines(
      @Headers("authorization") auth: string | undefined,
      @Param("householdId") hh: string,
      @Query() query: unknown,
    ) {
      const input = valid(baselinesQuerySchema, query);
      const service = use().baselines;
      if (!service) throw new ServiceUnavailableException();
      return service.read(
        await financeContext(use().identity, auth, hh),
        input.accountIds,
      );
    }
  }
  return ReportsController;
}
