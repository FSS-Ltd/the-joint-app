import {
  Body,
  Controller,
  Get,
  Header,
  Headers,
  Param,
  Put,
  Query,
  type Type,
} from "@nestjs/common";
import {
  contributionPlanWriteSchema,
  contributionQuerySchema,
  idempotencyKeySchema,
  quotedVersionSchema,
} from "@joint/contracts";
import { financeContext, validateInput as valid } from "../../../http-input.js";
import {
  contributionId as id,
  contributionReadQuery,
  requireContributions,
  type ContributionServices,
} from "./contribution-http.js";

export function createContributionPlanController(
  services?: ContributionServices,
): Type<unknown> {
  const use = () => requireContributions(services);
  @Controller("v1/households/:householdId/goals/:goalId/contribution-plan")
  class ContributionPlanController {
    @Put()
    @Header("Cache-Control", "no-store")
    async write(
      @Headers("authorization") auth: string | undefined,
      @Param("householdId") hh: string,
      @Param("goalId") goal: string,
      @Headers("idempotency-key") key: string | undefined,
      @Headers("if-match") version: string | undefined,
      @Body() body: unknown,
    ) {
      return use().contributions.writePlan(
        await financeContext(use().identity, auth, id(hh)),
        id(goal),
        valid(quotedVersionSchema, version),
        valid(contributionPlanWriteSchema, body),
        valid(idempotencyKeySchema, key),
      );
    }
    @Get()
    @Header("Cache-Control", "no-store")
    async read(
      @Headers("authorization") auth: string | undefined,
      @Param("householdId") hh: string,
      @Param("goalId") goal: string,
      @Query() query: unknown,
    ) {
      contributionReadQuery(query);
      return use().contributions.read(
        await financeContext(use().identity, auth, id(hh)),
        id(goal),
      );
    }
    @Get("history")
    @Header("Cache-Control", "no-store")
    async history(
      @Headers("authorization") auth: string | undefined,
      @Param("householdId") hh: string,
      @Param("goalId") goal: string,
      @Query() query: unknown,
    ) {
      const input = valid(contributionQuerySchema, query);
      return use().contributions.history(
        await financeContext(use().identity, auth, id(hh)),
        id(goal),
        input.cursor,
      );
    }
    @Get("export")
    @Header("Cache-Control", "no-store")
    @Header(
      "Content-Disposition",
      'attachment; filename="contribution-plan.json"',
    )
    async export(
      @Headers("authorization") auth: string | undefined,
      @Param("householdId") hh: string,
      @Param("goalId") goal: string,
      @Query() query: unknown,
    ) {
      const input = valid(contributionQuerySchema, query);
      return use().contributions.export(
        await financeContext(use().identity, auth, id(hh)),
        id(goal),
        input.cursor,
      );
    }
  }
  return ContributionPlanController;
}
