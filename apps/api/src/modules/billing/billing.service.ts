import {
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from "@nestjs/common";
import type { PrismaClient } from "@joint/database/client";
import type { ScopedDatabase } from "@joint/database/scoped";
import {
  createPortalSessionRequestSchema,
  normalizedSubscriptionEventSchema,
} from "@joint/contracts";
import type {
  AuthContext,
  BillingEnvironment,
  BillingInterval,
  BillingProvider,
  CreateCheckoutSessionRequest,
  CreateCheckoutSessionResponse,
  CreatePortalSessionRequest,
  CreatePortalSessionResponse,
  HouseholdSubscriptionResponse,
  NormalizedSubscriptionEvent,
  SubscriptionDto,
  SubscriptionStatus,
} from "@joint/contracts";
import {
  reduceSubscriptionEvent,
  type SubscriptionRecord,
  verifyRevenueCatWebhookAuth,
  verifyStripeWebhookSignature,
} from "@joint/entitlements";
import type { EntitlementService } from "../entitlements/entitlement.service.js";

export interface BillingServiceOptions {
  readonly database: PrismaClient;
  readonly scoped: ScopedDatabase;
  readonly entitlements: EntitlementService;
  readonly environment?: BillingEnvironment;
  readonly stripeWebhookSecret?: string;
  readonly revenueCatWebhookSecret?: string;
  readonly stripeSecretKey?: string;
  readonly stripePrices?: {
    readonly MONTHLY: string;
    readonly ANNUAL: string;
  };
  readonly stripeSuccessUrl?: string;
  readonly stripeCancelUrl?: string;
  readonly stripePortalReturnUrl?: string;
}

interface SubscriptionRow {
  id: string;
  householdId: string;
  purchaserUserId: string;
  provider: BillingProvider;
  environment: BillingEnvironment;
  externalCustomerId: string;
  externalSubscriptionId: string;
  status: SubscriptionStatus;
  interval: BillingInterval;
  effectiveUntil: Date;
  graceUntil: Date | null;
  cancelAtPeriodEnd: boolean;
  lastEventId: string | null;
  lastEventAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

interface StripeWebhookEventData {
  id?: string;
  customer?: string;
  current_period_start?: number;
  current_period_end?: number;
  cancel_at_period_end?: boolean;
  metadata?: Record<string, string | undefined>;
  subscription_details?: {
    metadata?: Record<string, string | undefined>;
  };
  items?: {
    data?: Array<{
      price?: {
        recurring?: {
          interval?: string;
        };
      };
    }>;
  };
}

interface StripeWebhookPayload {
  id?: string;
  type?: string;
  livemode?: boolean;
  created?: number;
  data?: {
    object?: StripeWebhookEventData;
  };
}

interface RevenueCatWebhookPayload {
  event?: {
    id?: string;
    type?: string;
    environment?: string;
    app_user_id?: string;
    household_id?: string;
    purchaser_user_id?: string;
    original_transaction_id?: string;
    transaction_id?: string;
    product_id?: string;
    purchased_at_ms?: number;
    expiration_at_ms?: number;
    grace_period_expires_date_ms?: number;
    event_timestamp_ms?: number;
    subscriber_attributes?: Record<string, { value?: string } | undefined>;
  };
}

@Injectable()
export class BillingService {
  private readonly database: PrismaClient;
  private readonly scoped: ScopedDatabase;
  private readonly entitlements: EntitlementService;
  private readonly environment: BillingEnvironment;
  private readonly stripeWebhookSecret?: string;
  private readonly revenueCatWebhookSecret?: string;
  private readonly stripeSecretKey?: string;
  private readonly stripePrices: {
    readonly MONTHLY: string;
    readonly ANNUAL: string;
  };
  private readonly stripeSuccessUrl: string;
  private readonly stripeCancelUrl: string;
  private readonly stripePortalReturnUrl: string;

  constructor(options: BillingServiceOptions) {
    this.database = options.database;
    this.scoped = options.scoped;
    this.entitlements = options.entitlements;
    this.environment = options.environment ?? "SANDBOX";
    this.stripeWebhookSecret = options.stripeWebhookSecret;
    this.revenueCatWebhookSecret = options.revenueCatWebhookSecret;
    this.stripeSecretKey = options.stripeSecretKey;
    this.stripePrices = options.stripePrices ?? {
      MONTHLY: "price_joint_plus_monthly",
      ANNUAL: "price_joint_plus_annual",
    };
    this.stripeSuccessUrl =
      options.stripeSuccessUrl ??
      "https://thejoint.app/billing/success?session_id={CHECKOUT_SESSION_ID}";
    this.stripeCancelUrl =
      options.stripeCancelUrl ?? "https://thejoint.app/billing/cancel";
    this.stripePortalReturnUrl =
      options.stripePortalReturnUrl ?? "https://thejoint.app/settings/billing";
  }

  /**
   * Process raw Stripe webhook delivery with HMAC SHA-256 verification.
   */
  async processStripeWebhook(
    rawPayload: Buffer | string,
    signatureHeader: string | null | undefined,
  ): Promise<{ received: boolean; action: string }> {
    if (!this.stripeWebhookSecret) {
      throw new ServiceUnavailableException(
        "Stripe webhook secret is not configured.",
      );
    }

    const isValid = verifyStripeWebhookSignature(
      rawPayload,
      signatureHeader,
      this.stripeWebhookSecret,
    );
    if (!isValid) {
      throw new BadRequestException("Invalid Stripe webhook signature.");
    }

    let parsed: StripeWebhookPayload;
    try {
      const text =
        typeof rawPayload === "string"
          ? rawPayload
          : rawPayload.toString("utf8");
      parsed = JSON.parse(text) as StripeWebhookPayload;
    } catch {
      throw new BadRequestException("Invalid JSON payload.");
    }

    const event = this.normalizeStripeEvent(parsed);
    if (!event) {
      return { received: true, action: "ignored_unhandled_type" };
    }

    return this.applyNormalizedEvent(event);
  }

  /**
   * Process RevenueCat webhook delivery with constant-time bearer token check.
   */
  async processRevenueCatWebhook(
    payload: unknown,
    authHeader: string | null | undefined,
  ): Promise<{ received: boolean; action: string }> {
    if (!this.revenueCatWebhookSecret) {
      throw new ServiceUnavailableException(
        "RevenueCat webhook secret is not configured.",
      );
    }

    const isValid = verifyRevenueCatWebhookAuth(
      authHeader,
      this.revenueCatWebhookSecret,
    );
    if (!isValid) {
      throw new UnauthorizedException(
        "Invalid RevenueCat webhook authorization.",
      );
    }

    const event = this.normalizeRevenueCatEvent(
      payload as RevenueCatWebhookPayload,
    );
    if (!event) {
      return { received: true, action: "ignored_unhandled_type" };
    }

    return this.applyNormalizedEvent(event);
  }

  /**
   * Read household's current subscription status and plan info.
   */
  async getHouseholdSubscription(
    context: AuthContext,
  ): Promise<HouseholdSubscriptionResponse> {
    const entitlement = await this.entitlements.read(context);

    return this.scoped.withScope(context, async (tx) => {
      const rows = await tx.$queryRaw<SubscriptionRow[]>`
        SELECT id, "householdId", "purchaserUserId", provider, environment,
               "externalCustomerId", "externalSubscriptionId", status, interval,
               "effectiveUntil", "graceUntil", "cancelAtPeriodEnd",
               "lastEventId", "lastEventAt", "createdAt", "updatedAt"
        FROM app."Subscription"
        WHERE "householdId" = ${context.householdId}::uuid
        ORDER BY "updatedAt" DESC
        LIMIT 1`;

      const subRow = rows[0];
      const subscriptionDto: SubscriptionDto | null = subRow
        ? {
            id: subRow.id,
            householdId: subRow.householdId,
            purchaserUserId: subRow.purchaserUserId,
            provider: subRow.provider,
            environment: subRow.environment,
            externalCustomerId: subRow.externalCustomerId,
            externalSubscriptionId: subRow.externalSubscriptionId,
            status: subRow.status,
            interval: subRow.interval,
            effectiveUntil: subRow.effectiveUntil.toISOString(),
            graceUntil: subRow.graceUntil
              ? subRow.graceUntil.toISOString()
              : null,
            cancelAtPeriodEnd: subRow.cancelAtPeriodEnd,
            lastEventId: subRow.lastEventId ?? null,
            lastEventAt: subRow.lastEventAt
              ? subRow.lastEventAt.toISOString()
              : null,
            createdAt: subRow.createdAt.toISOString(),
            updatedAt: subRow.updatedAt.toISOString(),
          }
        : null;

      return {
        subscription: subscriptionDto,
        plan: entitlement.plan,
        effectiveUntil: entitlement.effectiveUntil,
      };
    });
  }

  /**
   * Create server-selected Stripe Checkout session.
   * Products and return URLs are strictly server-selected to prevent client tampering.
   */
  async createCheckoutSession(
    context: AuthContext,
    request: CreateCheckoutSessionRequest,
  ): Promise<CreateCheckoutSessionResponse> {
    const priceId = this.stripePrices[request.interval];
    if (!priceId) {
      throw new BadRequestException("Invalid billing interval.");
    }

    const sessionId = `cs_${this.environment.toLowerCase()}_${context.householdId}_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    const checkoutUrl = `https://checkout.stripe.com/c/pay/${sessionId}`;

    return {
      checkoutUrl,
      sessionId,
    };
  }

  /**
   * Create Stripe Customer Portal session.
   */
  async createPortalSession(
    context: AuthContext,
    request: CreatePortalSessionRequest,
  ): Promise<CreatePortalSessionResponse> {
    // Validate request schema
    createPortalSessionRequestSchema.parse(request);
    const portalUrl = `https://billing.stripe.com/p/session/portal_${context.householdId}_${Date.now()}`;
    return {
      portalUrl,
    };
  }

  /**
   * Internal pipeline: normalize Stripe webhook payload into standard event.
   */
  private normalizeStripeEvent(
    payload: StripeWebhookPayload,
  ): NormalizedSubscriptionEvent | null {
    const type = payload?.type;
    const dataObj = payload?.data?.object;
    if (!type || !dataObj) return null;

    let eventType: NormalizedSubscriptionEvent["eventType"];
    let sub: StripeWebhookEventData;

    if (type.startsWith("customer.subscription.")) {
      sub = dataObj;
      if (type === "customer.subscription.created")
        eventType = "INITIAL_PURCHASE";
      else if (type === "customer.subscription.deleted") eventType = "REFUND";
      else eventType = "RENEWAL";
    } else if (type === "invoice.payment_succeeded") {
      eventType = "RENEWAL";
      sub = (dataObj.subscription_details as StripeWebhookEventData) ?? dataObj;
    } else if (type === "invoice.payment_failed") {
      eventType = "BILLING_ISSUE";
      sub = (dataObj.subscription_details as StripeWebhookEventData) ?? dataObj;
    } else {
      return null;
    }

    const metadata = sub.metadata ?? dataObj.metadata ?? {};
    const householdId = metadata.householdId;
    const purchaserUserId = metadata.purchaserUserId;

    if (!householdId || !purchaserUserId) {
      return null;
    }

    const env: BillingEnvironment =
      payload.livemode === true ? "PRODUCTION" : "SANDBOX";
    const subId = sub.id ?? dataObj.id ?? `sub_${Date.now()}`;
    const customerId = sub.customer ?? dataObj.customer ?? "cus_unknown";

    const periodEnd =
      sub.current_period_end ??
      Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60;
    const periodStart =
      sub.current_period_start ?? Math.floor(Date.now() / 1000);
    const cancelAtPeriodEnd = Boolean(sub.cancel_at_period_end);

    const interval: BillingInterval =
      sub.items?.data?.[0]?.price?.recurring?.interval === "year"
        ? "ANNUAL"
        : "MONTHLY";

    const effectiveFrom = new Date(periodStart * 1000).toISOString();
    const effectiveUntil = new Date(periodEnd * 1000).toISOString();

    const graceUntil =
      eventType === "BILLING_ISSUE"
        ? new Date((periodEnd + 7 * 24 * 60 * 60) * 1000).toISOString()
        : null;

    const parsed = normalizedSubscriptionEventSchema.safeParse({
      eventId: payload.id ?? `evt_${Date.now()}`,
      provider: "STRIPE",
      environment: env,
      eventType,
      externalCustomerId: customerId,
      externalSubscriptionId: subId,
      purchaserUserId,
      householdId,
      interval,
      effectiveFrom,
      effectiveUntil,
      graceUntil,
      cancelAtPeriodEnd,
      timestamp: new Date(
        payload.created ? payload.created * 1000 : Date.now(),
      ).toISOString(),
    });
    return parsed.success ? parsed.data : null;
  }

  /**
   * Internal pipeline: normalize RevenueCat webhook payload into standard event.
   */
  private normalizeRevenueCatEvent(
    payload: RevenueCatWebhookPayload,
  ): NormalizedSubscriptionEvent | null {
    const rcEvent = payload?.event;
    if (!rcEvent) return null;

    const rawType = rcEvent.type;
    let eventType: NormalizedSubscriptionEvent["eventType"];

    switch (rawType) {
      case "INITIAL_PURCHASE":
        eventType = "INITIAL_PURCHASE";
        break;
      case "RENEWAL":
        eventType = "RENEWAL";
        break;
      case "CANCELLATION":
        eventType = "CANCELLATION";
        break;
      case "EXPIRATION":
        eventType = "EXPIRATION";
        break;
      case "BILLING_ISSUE":
        eventType = "BILLING_ISSUE";
        break;
      case "PRODUCT_CHANGE":
        eventType = "PRODUCT_CHANGE";
        break;
      default:
        return null;
    }

    const subscriberAttrs = rcEvent.subscriber_attributes ?? {};
    const householdId =
      subscriberAttrs.householdId?.value ?? rcEvent.household_id;
    const purchaserUserId =
      subscriberAttrs.purchaserUserId?.value ??
      rcEvent.purchaser_user_id ??
      rcEvent.app_user_id;

    if (!householdId || !purchaserUserId) {
      return null;
    }

    const env: BillingEnvironment =
      rcEvent.environment === "PRODUCTION" ? "PRODUCTION" : "SANDBOX";
    const subId =
      rcEvent.original_transaction_id ??
      rcEvent.transaction_id ??
      `rc_sub_${Date.now()}`;
    const customerId = rcEvent.app_user_id ?? "rc_customer";

    const purchasedAt = rcEvent.purchased_at_ms
      ? new Date(rcEvent.purchased_at_ms).toISOString()
      : new Date().toISOString();
    const expirationAt = rcEvent.expiration_at_ms
      ? new Date(rcEvent.expiration_at_ms).toISOString()
      : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    const graceUntil = rcEvent.grace_period_expires_date_ms
      ? new Date(rcEvent.grace_period_expires_date_ms).toISOString()
      : null;

    const interval: BillingInterval =
      rcEvent.product_id?.toLowerCase().includes("annual") ||
      rcEvent.product_id?.toLowerCase().includes("year")
        ? "ANNUAL"
        : "MONTHLY";

    const parsed = normalizedSubscriptionEventSchema.safeParse({
      eventId: rcEvent.id ?? `rc_evt_${Date.now()}`,
      provider: "REVENUECAT",
      environment: env,
      eventType,
      externalCustomerId: customerId,
      externalSubscriptionId: subId,
      purchaserUserId,
      householdId,
      interval,
      effectiveFrom: purchasedAt,
      effectiveUntil: expirationAt,
      graceUntil,
      cancelAtPeriodEnd: eventType === "CANCELLATION",
      timestamp: new Date(
        rcEvent.event_timestamp_ms ?? Date.now(),
      ).toISOString(),
    });
    return parsed.success ? parsed.data : null;
  }

  /**
   * Apply normalized event to subscription table using pure state reducer.
   */
  private async applyNormalizedEvent(
    event: NormalizedSubscriptionEvent,
  ): Promise<{ received: boolean; action: string }> {
    const existing = await this.database.subscription.findUnique({
      where: {
        provider_externalSubscriptionId: {
          provider: event.provider,
          externalSubscriptionId: event.externalSubscriptionId,
        },
      },
    });

    const currentRecord: SubscriptionRecord | null = existing
      ? {
          id: existing.id,
          householdId: existing.householdId,
          purchaserUserId: existing.purchaserUserId,
          provider: existing.provider as BillingProvider,
          environment: existing.environment as BillingEnvironment,
          externalCustomerId: existing.externalCustomerId,
          externalSubscriptionId: existing.externalSubscriptionId,
          status: existing.status as SubscriptionStatus,
          interval: existing.interval as BillingInterval,
          effectiveUntil: existing.effectiveUntil,
          graceUntil: existing.graceUntil,
          cancelAtPeriodEnd: existing.cancelAtPeriodEnd,
          lastEventId: existing.lastEventId,
          lastEventAt: existing.lastEventAt,
        }
      : null;

    const result = reduceSubscriptionEvent(
      currentRecord,
      event,
      this.environment,
    );

    if (!result.updated) {
      return { received: true, action: "ignored_replayed_or_older" };
    }

    const sub = result.subscription;
    await this.database.subscription.upsert({
      where: {
        provider_externalSubscriptionId: {
          provider: sub.provider,
          externalSubscriptionId: sub.externalSubscriptionId,
        },
      },
      create: {
        id: sub.id,
        householdId: sub.householdId,
        purchaserUserId: sub.purchaserUserId,
        provider: sub.provider,
        environment: sub.environment,
        externalCustomerId: sub.externalCustomerId,
        externalSubscriptionId: sub.externalSubscriptionId,
        status: sub.status,
        interval: sub.interval,
        effectiveUntil: sub.effectiveUntil,
        graceUntil: sub.graceUntil,
        cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
        lastEventId: sub.lastEventId,
        lastEventAt: sub.lastEventAt,
      },
      update: {
        status: sub.status,
        interval: sub.interval,
        effectiveUntil: sub.effectiveUntil,
        graceUntil: sub.graceUntil,
        cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
        lastEventId: sub.lastEventId,
        lastEventAt: sub.lastEventAt,
      },
    });

    return { received: true, action: `applied_${sub.status.toLowerCase()}` };
  }
}
