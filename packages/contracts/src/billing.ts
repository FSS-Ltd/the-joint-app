import { z } from "zod";
import { timestampSchema } from "./projection-primitives.js";

export const billingProviderSchema = z.enum(["STRIPE", "REVENUECAT"]);
export type BillingProvider = z.infer<typeof billingProviderSchema>;

export const billingEnvironmentSchema = z.enum(["SANDBOX", "PRODUCTION"]);
export type BillingEnvironment = z.infer<typeof billingEnvironmentSchema>;

export const billingIntervalSchema = z.enum(["MONTHLY", "ANNUAL"]);
export type BillingInterval = z.infer<typeof billingIntervalSchema>;

export const subscriptionStatusSchema = z.enum([
  "ACTIVE",
  "TRIALING",
  "GRACE_PERIOD",
  "PAST_DUE",
  "CANCELED",
  "EXPIRED",
]);
export type SubscriptionStatus = z.infer<typeof subscriptionStatusSchema>;

export const billingEventTypeSchema = z.enum([
  "INITIAL_PURCHASE",
  "RENEWAL",
  "CANCELLATION",
  "EXPIRATION",
  "BILLING_ISSUE",
  "REFUND",
  "PRODUCT_CHANGE",
]);
export type BillingEventType = z.infer<typeof billingEventTypeSchema>;

export const normalizedSubscriptionEventSchema = z
  .object({
    eventId: z.string().min(1).max(120),
    provider: billingProviderSchema,
    environment: billingEnvironmentSchema,
    eventType: billingEventTypeSchema,
    externalCustomerId: z.string().min(1).max(120),
    externalSubscriptionId: z.string().min(1).max(120),
    purchaserUserId: z.uuid(),
    householdId: z.uuid(),
    interval: billingIntervalSchema,
    effectiveFrom: timestampSchema,
    effectiveUntil: timestampSchema,
    graceUntil: timestampSchema.nullable(),
    cancelAtPeriodEnd: z.boolean(),
    timestamp: timestampSchema,
  })
  .strict();
export type NormalizedSubscriptionEvent = z.infer<
  typeof normalizedSubscriptionEventSchema
>;

export const subscriptionDtoSchema = z
  .object({
    id: z.uuid(),
    householdId: z.uuid(),
    purchaserUserId: z.uuid(),
    provider: billingProviderSchema,
    environment: billingEnvironmentSchema,
    externalCustomerId: z.string(),
    externalSubscriptionId: z.string(),
    status: subscriptionStatusSchema,
    interval: billingIntervalSchema,
    effectiveUntil: timestampSchema,
    graceUntil: timestampSchema.nullable(),
    cancelAtPeriodEnd: z.boolean(),
    lastEventId: z.string().nullable(),
    lastEventAt: timestampSchema.nullable(),
    createdAt: timestampSchema,
    updatedAt: timestampSchema,
  })
  .strict();
export type SubscriptionDto = z.infer<typeof subscriptionDtoSchema>;

export const createCheckoutSessionRequestSchema = z
  .object({
    interval: billingIntervalSchema,
  })
  .strict();
export type CreateCheckoutSessionRequest = z.infer<
  typeof createCheckoutSessionRequestSchema
>;

export const createCheckoutSessionResponseSchema = z
  .object({
    checkoutUrl: z.url(),
    sessionId: z.string().min(1),
  })
  .strict();
export type CreateCheckoutSessionResponse = z.infer<
  typeof createCheckoutSessionResponseSchema
>;

export const createPortalSessionRequestSchema = z.object({}).strict();
export type CreatePortalSessionRequest = z.infer<
  typeof createPortalSessionRequestSchema
>;

export const createPortalSessionResponseSchema = z
  .object({
    portalUrl: z.url(),
  })
  .strict();
export type CreatePortalSessionResponse = z.infer<
  typeof createPortalSessionResponseSchema
>;

export const householdSubscriptionResponseSchema = z
  .object({
    subscription: subscriptionDtoSchema.nullable(),
    plan: z.enum(["FREE", "PLUS"]),
    effectiveUntil: timestampSchema.nullable(),
  })
  .strict();
export type HouseholdSubscriptionResponse = z.infer<
  typeof householdSubscriptionResponseSchema
>;
