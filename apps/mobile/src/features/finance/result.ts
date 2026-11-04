import type { NativeResourceScope } from "../../events/scope";
import { NativeApiError } from "./errors";

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
/** Schemas validate shape; this guard binds DTO identifiers to the requested resource. */
export function assertFinanceResult(
  value: unknown,
  scope: NativeResourceScope,
): void {
  if (!record(value)) return;
  if ("householdId" in value && value.householdId !== scope.householdId)
    throw new NativeApiError(409, "RESOURCE_MISMATCH");
  if (
    scope.selector.kind === "account" &&
    "id" in value &&
    value.id !== scope.selector.id
  )
    throw new NativeApiError(409, "RESOURCE_MISMATCH");
  if (scope.selector.kind === "accounts" && Array.isArray(value.items))
    for (const account of value.items) {
      if (!record(account) || account.householdId !== scope.householdId)
        throw new NativeApiError(409, "RESOURCE_MISMATCH");
    }
  if (scope.selector.kind === "wealth" && record(value.scope)) {
    if (value.scope.grantVersion !== scope.grantVersion)
      throw new NativeApiError(409, "AUTHORITY_CHANGED");
    if (scope.selector.accountIds !== undefined) {
      const requested = scope.selector.accountIds
        .split(",")
        .map((id) => id.toLowerCase())
        .sort();
      const received = Array.isArray(value.scope.accountIds)
        ? value.scope.accountIds
        : [];
      if (
        received.length !== requested.length ||
        received.some(
          (id, index) =>
            typeof id !== "string" || id.toLowerCase() !== requested[index],
        )
      )
        throw new NativeApiError(409, "RESOURCE_MISMATCH");
    }
  }
}
