import { z } from "zod";
import { billingIntervalSchema, type BillingInterval } from "./billing.js";
export type { BillingInterval };

export const staffRoleSchema = z.enum(["ANALYTICS_VIEWER", "STAFF_ADMIN"]);
export type StaffRole = z.infer<typeof staffRoleSchema>;

export const staffMemberDtoSchema = z
  .object({
    id: z.string().uuid(),
    userId: z.string().uuid(),
    role: staffRoleSchema,
    grantedByUserId: z.string().uuid().nullable().optional(),
    revokedAt: z.string().datetime().nullable().optional(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .strict();
export type StaffMemberDto = z.infer<typeof staffMemberDtoSchema>;

export const userLifecycleEventTypeSchema = z.enum([
  "USER_REGISTERED",
  "USER_ACTIVATED",
  "USER_DEACTIVATED",
  "USER_DELETED",
]);
export type UserLifecycleEventType = z.infer<
  typeof userLifecycleEventTypeSchema
>;

export const subscriptionLifecycleEventTypeSchema = z.enum([
  "SUBSCRIPTION_STARTED",
  "SUBSCRIPTION_RENEWED",
  "SUBSCRIPTION_CANCELLED",
  "SUBSCRIPTION_EXPIRED",
]);
export type SubscriptionLifecycleEventType = z.infer<
  typeof subscriptionLifecycleEventTypeSchema
>;

export const planTierSchema = z.enum([
  "STANDARD_MONTHLY",
  "STANDARD_ANNUAL",
  "FOUNDER_ANNUAL",
]);
export type PlanTier = z.infer<typeof planTierSchema>;

export const promotionalDiscountSchema = z
  .object({
    code: z.string().min(1).max(40),
    discountMinor: z.number().int().nonnegative(),
    effectiveFrom: z.string().datetime(),
    effectiveUntil: z.string().datetime(),
  })
  .strict();
export type PromotionalDiscount = z.infer<typeof promotionalDiscountSchema>;

export const subscriptionLifecyclePayloadSchema = z
  .object({
    eventType: subscriptionLifecycleEventTypeSchema,
    planTier: planTierSchema,
    billingInterval: billingIntervalSchema,
    priceMinor: z.number().int().nonnegative(),
    currency: z.literal("GBP"),
    isSandbox: z.boolean().default(false),
    isTestAccount: z.boolean().default(false),
    promotionalDiscount: promotionalDiscountSchema.optional(),
  })
  .strict();
export type SubscriptionLifecyclePayload = z.infer<
  typeof subscriptionLifecyclePayloadSchema
>;

export const userLifecyclePayloadSchema = z
  .object({
    eventType: userLifecycleEventTypeSchema,
    isTestAccount: z.boolean().default(false),
  })
  .strict();
export type UserLifecyclePayload = z.infer<typeof userLifecyclePayloadSchema>;

export const refundLifecyclePayloadSchema = z
  .object({
    eventType: z.literal("REFUND_ISSUED"),
    refundAmountMinor: z.number().int().positive(),
    currency: z.literal("GBP"),
    isSandbox: z.boolean().default(false),
    isTestAccount: z.boolean().default(false),
    reason: z.string().max(80).optional(),
  })
  .strict();
export type RefundLifecyclePayload = z.infer<
  typeof refundLifecyclePayloadSchema
>;

export const activityLifecyclePayloadSchema = z
  .object({
    eventType: z.literal("QUALIFYING_ACTIVITY"),
    cohortWeek: z.string().regex(/^\d{4}-W\d{2}$/),
    activityWeek: z.string().regex(/^\d{4}-W\d{2}$/),
    isTestAccount: z.boolean().default(false),
  })
  .strict();
export type ActivityLifecyclePayload = z.infer<
  typeof activityLifecyclePayloadSchema
>;

export const analyticsLifecycleEventInputSchema = z
  .object({
    eventId: z.string().min(1).max(120),
    eventType: z.string().min(1).max(80),
    eventVersion: z.number().int().positive().default(1),
    opaqueSubjectId: z
      .string()
      .regex(
        /^[0-9a-f]{64}$/i,
        "Must be a 64-character SHA-256 hexadecimal string",
      ),
    subjectType: z.enum(["USER", "HOUSEHOLD"]),
    occurredAt: z.string().datetime(),
    isSandbox: z.boolean().default(false),
    isTestAccount: z.boolean().default(false),
    payload: z.record(z.string(), z.unknown()),
  })
  .strict();
export type AnalyticsLifecycleEventInput = z.input<
  typeof analyticsLifecycleEventInputSchema
>;

export const staffPeriodQuerySchema = z
  .object({
    startDate: z.string().datetime(),
    endDate: z.string().datetime(),
    timezone: z.literal("Europe/London").default("Europe/London"),
  })
  .strict();
export type StaffPeriodQuery = z.infer<typeof staffPeriodQuerySchema>;

export const churnMetricSchema = z
  .object({
    churnRate: z.number(),
    startCount: z.number().int().nonnegative(),
    lostCount: z.number().int().nonnegative(),
    denominatorZero: z.boolean(),
  })
  .strict();
export type ChurnMetric = z.infer<typeof churnMetricSchema>;

export const activationMetricSchema = z
  .object({
    activationRate: z.number(),
    registeredCount: z.number().int().nonnegative(),
    activatedCount: z.number().int().nonnegative(),
    denominatorZero: z.boolean(),
  })
  .strict();
export type ActivationMetric = z.infer<typeof activationMetricSchema>;

export const turnoverMetricSchema = z
  .object({
    turnoverRate: z.number(),
    startCohortCount: z.number().int().nonnegative(),
    deletedFromStartCohortCount: z.number().int().nonnegative(),
    denominatorZero: z.boolean(),
  })
  .strict();
export type TurnoverMetric = z.infer<typeof turnoverMetricSchema>;

export const staffMetricsSummaryResponseSchema = z
  .object({
    period: z
      .object({
        startDate: z.string(),
        endDate: z.string(),
        timezone: z.string(),
      })
      .strict(),
    activePaidHouseholds: z.number().int().nonnegative(),
    mrrMinor: z.number().int().nonnegative(),
    grossCollectedMinor: z.number().int().nonnegative(),
    refundsMinor: z.number().int().nonnegative(),
    netCollectedRevenueMinor: z.number().int(),
    promotionalDiscounts: z.array(promotionalDiscountSchema),
    payingHouseholdChurn: churnMetricSchema,
    userActivation: activationMetricSchema,
    userTurnover: turnoverMetricSchema,
    unknownSourceCoverage: z.boolean(),
  })
  .strict();
export type StaffMetricsSummaryResponse = z.infer<
  typeof staffMetricsSummaryResponseSchema
>;

export const retentionCohortQuerySchema = z
  .object({
    maxCohorts: z.coerce.number().int().min(1).max(24).default(8),
  })
  .strict();
export type RetentionCohortQuery = z.infer<typeof retentionCohortQuerySchema>;

export const retentionCohortCellSchema = z
  .object({
    weekIndex: z.number().int().nonnegative(),
    suppressed: z.boolean(),
    activeUsers: z.number().int().nonnegative().optional(),
    retentionRate: z.number().optional(),
  })
  .strict();
export type RetentionCohortCell = z.infer<typeof retentionCohortCellSchema>;

export const retentionCohortRowSchema = z
  .object({
    cohortWeek: z.string(),
    cohortSizeSuppressed: z.boolean(),
    cohortSize: z.number().int().nonnegative().optional(),
    cells: z.array(retentionCohortCellSchema),
  })
  .strict();
export type RetentionCohortRow = z.infer<typeof retentionCohortRowSchema>;

export const staffRetentionCohortsResponseSchema = z
  .object({
    cohorts: z.array(retentionCohortRowSchema),
    suppressionThreshold: z.literal(5),
    generatedAt: z.string(),
  })
  .strict();
export type StaffRetentionCohortsResponse = z.infer<
  typeof staffRetentionCohortsResponseSchema
>;
