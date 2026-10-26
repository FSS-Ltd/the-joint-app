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

export function createContributionArchiveController(
  services?: ContributionServices,
): Type<unknown> {
  const use = () => requireContributions(services);
  @Controller("v1/me/archive/contribution-budgets")
  class ContributionArchiveController {
    @Get()
    @Header("Cache-Control", "no-store")
    async list(
      @Headers("authorization") auth: string | undefined,
      @Query() query: unknown,
    ) {
      const input = valid(contributionQuerySchema, query);
      return use().contributions.listArchive(
        await ownerArchiveContext(use().identity, auth),
        input.cursor,
      );
    }
    @Get(":budgetId")
    @Header("Cache-Control", "no-store")
    async read(
      @Headers("authorization") auth: string | undefined,
      @Param("budgetId") budget: string,
      @Query() query: unknown,
    ) {
      contributionReadQuery(query);
      return use().contributions.readArchive(
        await ownerArchiveContext(use().identity, auth),
        id(budget),
      );
    }
    @Get(":budgetId/history")
    @Header("Cache-Control", "no-store")
    async history(
      @Headers("authorization") auth: string | undefined,
      @Param("budgetId") budget: string,
      @Query() query: unknown,
    ) {
      const input = valid(contributionQuerySchema, query);
      return use().contributions.historyArchive(
        await ownerArchiveContext(use().identity, auth),
        id(budget),
        undefined,
        input.cursor,
      );
    }
    @Get(":budgetId/export")
    @Header("Cache-Control", "no-store")
    @Header(
      "Content-Disposition",
      'attachment; filename="contribution-budget-archive.json"',
    )
    async export(
      @Headers("authorization") auth: string | undefined,
      @Param("budgetId") budget: string,
      @Query() query: unknown,
    ) {
      const input = valid(contributionQuerySchema, query);
      return use().contributions.exportArchive(
        await ownerArchiveContext(use().identity, auth),
        id(budget),
        undefined,
        input.cursor,
      );
    }
  }
  return ContributionArchiveController;
}
