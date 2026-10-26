import {
  BadRequestException,
  ServiceUnavailableException,
} from "@nestjs/common";
import {
  contributionQuerySchema,
  idempotencyKeySchema,
} from "@joint/contracts";
import { validateInput } from "../../../http-input.js";
import type { IdentityAccess } from "../../identity/identity.service.js";
import type { ContributionService } from "./contribution.service.js";

export interface ContributionServices {
  identity: IdentityAccess;
  contributions: ContributionService;
}
export function requireContributions(
  services: ContributionServices | undefined,
): ContributionServices {
  if (!services) throw new ServiceUnavailableException();
  return services;
}
export function contributionId(value: string): string {
  return validateInput(idempotencyKeySchema, value).toLowerCase();
}
export function contributionReadQuery(query: unknown): void {
  if (validateInput(contributionQuerySchema, query).cursor !== undefined)
    throw new BadRequestException();
}
