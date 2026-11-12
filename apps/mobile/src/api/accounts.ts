import {
  accountCreateSchema,
  accountListQuerySchema,
  accountListSchema,
  accountPatchSchema,
  accountSchema,
  csvBalanceListSchema,
  scopeAccountIdsSchema,
  grantInputSchema,
  idempotencyKeySchema,
  quotedVersionSchema,
  valuationInputSchema,
} from "@joint/contracts";
import type { NativeTransport } from "./types";
import { NativeApiError } from "./errors";

type AccountInput = ReturnType<typeof accountCreateSchema.parse>;
type AccountPatch = ReturnType<typeof accountPatchSchema.parse>;
type GrantInput = ReturnType<typeof grantInputSchema.parse>;
type ValuationInput = ReturnType<typeof valuationInputSchema.parse>;
type AccountPage = { limit?: number; cursor?: string };

function collection(householdId: string): string {
  return `households/${idempotencyKeySchema.parse(householdId)}/accounts`;
}
function resource(householdId: string, accountId: string): string {
  return `${collection(householdId)}/${idempotencyKeySchema.parse(accountId)}`;
}
function version(value: number): number {
  return quotedVersionSchema.parse(`"${value}"`);
}

export function createAccountsApi(transport: NativeTransport) {
  return {
    list(householdId: string, page: AccountPage, signal: AbortSignal) {
      const path = collection(householdId);
      const parsed = accountListQuerySchema.parse(page);
      const query = new URLSearchParams({ limit: String(parsed.limit) });
      if (parsed.cursor !== undefined) query.set("cursor", parsed.cursor);
      return transport.request(
        `${path}?${query.toString()}`,
        accountListSchema,
        { method: "GET", signal },
      );
    },
    async currentBalances(
      householdId: string,
      accountIds: readonly string[],
      signal: AbortSignal,
    ) {
      const ids = scopeAccountIdsSchema.parse(accountIds);
      const query = new URLSearchParams({ accountIds: ids.join(",") });
      const result = await transport.request(
        `${collection(householdId)}/current-balances?${query.toString()}`,
        csvBalanceListSchema,
        { method: "GET", signal },
      );
      const received = result.items
        .map((item) => item.accountId.toLowerCase())
        .sort();
      if (
        received.length !== ids.length ||
        received.some((id, index) => id !== ids[index])
      )
        throw new NativeApiError(409, "RESOURCE_MISMATCH");
      return result;
    },
    read(householdId: string, accountId: string, signal: AbortSignal) {
      return transport.request(
        resource(householdId, accountId),
        accountSchema,
        { method: "GET", signal },
      );
    },
    create(
      householdId: string,
      input: AccountInput,
      key: string,
      signal: AbortSignal,
    ) {
      return transport.request(collection(householdId), accountSchema, {
        method: "POST",
        signal,
        body: accountCreateSchema.parse(input),
        idempotencyKey: idempotencyKeySchema.parse(key),
      });
    },
    patch(
      householdId: string,
      accountId: string,
      input: AccountPatch,
      expectedVersion: number,
      signal: AbortSignal,
    ) {
      return transport.request(
        resource(householdId, accountId),
        accountSchema,
        {
          method: "PATCH",
          signal,
          body: accountPatchSchema.parse(input),
          version: version(expectedVersion),
        },
      );
    },
    value(
      householdId: string,
      accountId: string,
      input: ValuationInput,
      key: string,
      expectedVersion: number,
      signal: AbortSignal,
    ) {
      return transport.request(
        `${resource(householdId, accountId)}/valuations`,
        accountSchema,
        {
          method: "POST",
          signal,
          body: valuationInputSchema.parse(input),
          idempotencyKey: idempotencyKeySchema.parse(key),
          version: version(expectedVersion),
        },
      );
    },
    setGrant(
      householdId: string,
      accountId: string,
      membershipId: string,
      input: GrantInput,
      expectedVersion: number,
      signal: AbortSignal,
    ) {
      return transport.request(
        `${resource(householdId, accountId)}/grants/${idempotencyKeySchema.parse(membershipId)}`,
        accountSchema,
        {
          method: "PUT",
          signal,
          body: grantInputSchema.parse(input),
          version: version(expectedVersion),
        },
      );
    },
  };
}
export type AccountsApi = ReturnType<typeof createAccountsApi>;
