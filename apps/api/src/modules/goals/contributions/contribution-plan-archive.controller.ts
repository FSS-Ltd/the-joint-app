import {
  Controller,
  Get,
  Header,
  Headers,
  Param,
  Query,
  type Type,
} from "@nestjs/common";
import { contributionQuerySchema } from "@joint/contracts";
import {
  ownerArchiveContext,
  validateInput as valid,
} from "../../../http-input.js";
import {
  contributionId as id,
  contributionReadQuery,
  requireContributions,
  type ContributionServices,
} from "./contribution-http.js";

export function createContributionPlanArchiveController(
  services?: ContributionServices,
): Type<unknown> {
  const use = () => requireContributions(services);
  @Controller(
    "v1/me/archive/contribution-budgets/:budgetId/goals/:goalId/contribution-plan",
  )
  class ContributionPlanArchiveController {
    @Get()
    @Header("Cache-Control", "no-store")
    async read(
      @Headers("authorization") auth: string | undefined,
      @Param("budgetId") budget: string,
      @Param("goalId") goal: string,
      @Query() query: unknown,
    ) {
      contributionReadQuery(query);
      return use().contributions.readArchive(
        await ownerArchiveContext(use().identity, auth),
        id(budget),
        id(goal),
      );
    }
    @Get("history")
    @Header("Cache-Control", "no-store")
    async history(
      @Headers("authorization") auth: string | undefined,
      @Param("budgetId") budget: string,
      @Param("goalId") goal: string,
      @Query() query: unknown,
    ) {
      const input = valid(contributionQuerySchema, query);
      return use().contributions.historyArchive(
        await ownerArchiveContext(use().identity, auth),
        id(budget),
        id(goal),
        input.cursor,
      );
    }
    @Get("export")
    @Header("Cache-Control", "no-store")
    @Header(
      "Content-Disposition",
      'attachment; filename="contribution-plan-archive.json"',
    )
    async export(
      @Headers("authorization") auth: string | undefined,
      @Param("budgetId") budget: string,
      @Param("goalId") goal: string,
      @Query() query: unknown,
    ) {
      const input = valid(contributionQuerySchema, query);
      return use().contributions.exportArchive(
        await ownerArchiveContext(use().identity, auth),
        id(budget),
        id(goal),
        input.cursor,
      );
    }
  }
  return ContributionPlanArchiveController;
}
