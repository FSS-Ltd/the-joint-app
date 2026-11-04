import {
  idempotencyKeySchema,
  scopeAccountIdsSchema,
  wealthSummaryDtoSchema,
  type WealthSummaryDto,
} from "@joint/contracts";
import type { NativeTransport } from "./types";

export function createWealthApi(transport: NativeTransport) {
  return {
    read(
      householdId: string,
      accountIds: readonly string[] | undefined,
      signal: AbortSignal,
    ): Promise<WealthSummaryDto> {
      const path = `households/${idempotencyKeySchema.parse(householdId)}/wealth`;
      const query = new URLSearchParams();
      if (accountIds !== undefined)
        query.set(
          "accountIds",
          scopeAccountIdsSchema.parse(accountIds).join(","),
        );
      const suffix = query.size ? `?${query.toString()}` : "";
      return transport.request(`${path}${suffix}`, wealthSummaryDtoSchema, {
        method: "GET",
        signal,
      });
    },
  };
}
export type WealthApi = ReturnType<typeof createWealthApi>;
