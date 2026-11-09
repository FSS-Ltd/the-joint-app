import {
  householdSubscriptionResponseSchema,
  idempotencyKeySchema,
  type HouseholdSubscriptionResponse,
} from "@joint/contracts";
import type { NativeTransport } from "./types";

export function createBillingApi(transport: NativeTransport) {
  return {
    getSubscription(
      householdId: string,
      signal?: AbortSignal,
    ): Promise<HouseholdSubscriptionResponse> {
      const cleanHouseholdId = idempotencyKeySchema.parse(householdId);
      return transport.request(
        `households/${cleanHouseholdId}/billing/subscription`,
        householdSubscriptionResponseSchema,
        {
          method: "GET",
          signal: signal ?? new AbortController().signal,
        },
      );
    },
  };
}

export type BillingApi = ReturnType<typeof createBillingApi>;
