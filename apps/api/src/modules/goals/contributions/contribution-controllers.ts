import type { Type } from "@nestjs/common";
import { createContributionBudgetController } from "./contribution-budget.controller.js";
import { createContributionPlanController } from "./contribution-plan.controller.js";
import { createContributionArchiveController } from "./contribution-archive.controller.js";
import { createContributionPlanArchiveController } from "./contribution-plan-archive.controller.js";
import type { ContributionServices } from "./contribution-http.js";

export function createContributionControllers(
  services?: ContributionServices,
): Type<unknown>[] {
  return [
    createContributionBudgetController(services),
    createContributionPlanController(services),
    createContributionArchiveController(services),
    createContributionPlanArchiveController(services),
  ];
}
