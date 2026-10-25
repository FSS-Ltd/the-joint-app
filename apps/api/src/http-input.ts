import { readIdentityToken } from "./identity-header.js";
import {
  BadRequestException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { idempotencyKeySchema, type AuthContext } from "@joint/contracts";
import type { IdentityAccess } from "./modules/identity/identity.service.js";
import { randomUUID } from "node:crypto";
import type { OwnerArchiveContext } from "@joint/database/archive";

export async function ownerArchiveContext(
  identity: Pick<IdentityAccess, "actor">,
  header: string | undefined,
): Promise<OwnerArchiveContext> {
  return {
    ...(await identity.actor(readIdentityToken(header))),
    requestId: randomUUID(),
  };
}

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
  identity: Pick<IdentityAccess, "financeContext"> | undefined,
  header: string | undefined,
  householdId: string,
): Promise<AuthContext> {
  if (!identity) throw new ServiceUnavailableException();
  return identity.financeContext(
    readIdentityToken(header),
    validateInput(idempotencyKeySchema, householdId),
  );
}
