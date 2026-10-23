import {
  BadRequestException,
  ServiceUnavailableException,
  UnauthorizedException,
} from "@nestjs/common";
import { idempotencyKeySchema, type AuthContext } from "@joint/contracts";
import type { IdentityService } from "./modules/identity/identity.service.js";

export function validateInput<T>(
  schema: {
    safeParse(value: unknown): { success: true; data: T } | { success: false };
  },
  value: unknown,
): T {
  const result = schema.safeParse(value);
  if (!result.success) throw new BadRequestException();
  return result.data;
}
export function financeContext(
  identity: IdentityService | undefined,
  header: string | undefined,
  householdId: string,
): Promise<AuthContext> {
  if (!identity) throw new ServiceUnavailableException();
  if (!header || !/^Session [A-Za-z0-9_-]{43}$/.test(header))
    throw new UnauthorizedException();
  return identity.financeContext(
    header.slice(8),
    validateInput(idempotencyKeySchema, householdId),
  );
}
