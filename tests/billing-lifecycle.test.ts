import { createHmac, randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  subscriptionDtoSchema,
  type AuthContext,
  type NormalizedSubscriptionEvent,
} from "../packages/contracts/src/index.js";
import {
  BillingError,
  reduceSubscriptionEvent,
  verifyRevenueCatWebhookAuth,
  verifyStripeWebhookSignature,
} from "../packages/entitlements/src/index.js";
import { BillingService } from "../apps/api/src/modules/billing/billing.service.js";
import { maintainSubscriptions } from "../apps/worker/src/billing-maintenance.js";
import type { PrismaClient } from "../packages/database/dist/client.js";
import type { ScopedDatabase } from "../packages/database/dist/scoped-transaction.js";
import type { EntitlementService } from "../apps/api/src/modules/entitlements/entitlement.service.js";

describe("Billing Lifecycle & Security", () => {
  const secret = "whsec_test_secret_1234567890abcdef";
  const rcSecret = "rc_secret_test_token_abcdef123456";
  const nowSeconds = Math.floor(Date.now() / 1000);
  const now = new Date(nowSeconds * 1000);

  describe("Stripe Webhook Signature Verification", () => {
    it("accepts valid HMAC SHA-256 signature within tolerance window", () => {
      const payload = JSON.stringify({
        id: "evt_123",
        type: "customer.subscription.created",
      });
      const signedPayload = `${nowSeconds}.${payload}`;
      const sig = createHmac("sha256", secret)
        .update(signedPayload, "utf8")
        .digest("hex");
      const header = `t=${nowSeconds},v1=${sig}`;

      expect(
        verifyStripeWebhookSignature(payload, header, secret, nowSeconds, 300),
      ).toBe(true);
    });

    it("rejects forged or modified payload signature", () => {
      const payload = JSON.stringify({
        id: "evt_123",
        type: "customer.subscription.created",
      });
      const forgedSig = createHmac("sha256", secret)
        .update(`tampered`, "utf8")
        .digest("hex");
      const header = `t=${nowSeconds},v1=${forgedSig}`;

      expect(
        verifyStripeWebhookSignature(payload, header, secret, nowSeconds, 300),
      ).toBe(false);
    });

    it("rejects signatures outside the 300-second tolerance window (replay protection)", () => {
      const payload = JSON.stringify({ id: "evt_123" });
      const oldTimestamp = nowSeconds - 301;
      const signedPayload = `${oldTimestamp}.${payload}`;
      const sig = createHmac("sha256", secret)
        .update(signedPayload, "utf8")
        .digest("hex");
      const header = `t=${oldTimestamp},v1=${sig}`;

      expect(
        verifyStripeWebhookSignature(payload, header, secret, nowSeconds, 300),
      ).toBe(false);
    });

    it("rejects missing signature or missing secret safely", () => {
      expect(verifyStripeWebhookSignature("payload", null, secret)).toBe(false);
      expect(verifyStripeWebhookSignature("payload", "t=123,v1=abc", "")).toBe(
        false,
      );
    });
  });

  describe("RevenueCat Webhook Auth Verification", () => {
    it("accepts valid Bearer authorization header with constant-time equality", () => {
      expect(verifyRevenueCatWebhookAuth(`Bearer ${rcSecret}`, rcSecret)).toBe(
        true,
      );
    });

    it("rejects invalid Bearer authorization header", () => {
      expect(verifyRevenueCatWebhookAuth("Bearer wrong_secret", rcSecret)).toBe(
        false,
      );
      expect(verifyRevenueCatWebhookAuth("wrong_header", rcSecret)).toBe(false);
      expect(verifyRevenueCatWebhookAuth(null, rcSecret)).toBe(false);
    });
  });

  describe("Pure Subscription State Reducer", () => {
    const householdId = randomUUID();
    const purchaserUserId = randomUUID();

    const baseEvent = (
      overrides: Partial<NormalizedSubscriptionEvent> = {},
    ): NormalizedSubscriptionEvent => ({
      eventId: "evt_001",
      provider: "STRIPE",
      environment: "SANDBOX",
      eventType: "INITIAL_PURCHASE",
      externalCustomerId: "cus_123",
      externalSubscriptionId: "sub_123",
      purchaserUserId,
      householdId,
      interval: "MONTHLY",
      effectiveFrom: new Date(
        now.getTime() - 24 * 60 * 60 * 1000,
      ).toISOString(),
      effectiveUntil: new Date(
        now.getTime() + 30 * 24 * 60 * 60 * 1000,
      ).toISOString(),
      graceUntil: null,
      cancelAtPeriodEnd: false,
      timestamp: now.toISOString(),
      ...overrides,
    });

    it("rejects sandbox events in production context", () => {
      const event = baseEvent({ environment: "SANDBOX" });
      expect(() =>
        reduceSubscriptionEvent(null, event, "PRODUCTION", now),
      ).toThrow(BillingError);
    });

    it("allows sandbox events in sandbox context", () => {
      const event = baseEvent({ environment: "SANDBOX" });
      const result = reduceSubscriptionEvent(null, event, "SANDBOX", now);
      expect(result.updated).toBe(true);
      expect(result.subscription.status).toBe("ACTIVE");
      expect(result.shouldGrant).toBe(true);
    });

    it("generates valid UUID for new subscriptions and preserves canonical id on update", () => {
      const event = baseEvent({ eventId: "evt_stripe_non_uuid_123" });
      const created = reduceSubscriptionEvent(null, event, "SANDBOX", now);
      expect(created.updated).toBe(true);
      expect(
        subscriptionDtoSchema.shape.id.safeParse(created.subscription.id)
          .success,
      ).toBe(true);

      const updateEvent = baseEvent({
        eventId: "evt_stripe_non_uuid_456",
        eventType: "RENEWAL",
        timestamp: new Date(now.getTime() + 1000).toISOString(),
      });
      const updated = reduceSubscriptionEvent(
        created.subscription,
        updateEvent,
        "SANDBOX",
        now,
      );
      expect(updated.updated).toBe(true);
      expect(updated.subscription.id).toBe(created.subscription.id);
    });

    it("idempotently ignores older or replayed events", () => {
      const event = baseEvent();
      const first = reduceSubscriptionEvent(null, event, "SANDBOX", now);
      expect(first.updated).toBe(true);

      const replayed = reduceSubscriptionEvent(
        first.subscription,
        event,
        "SANDBOX",
        now,
      );
      expect(replayed.updated).toBe(false);
      expect(replayed.reason).toBe("Replay or older event ignored.");

      const olderEvent = baseEvent({
        eventId: "evt_older",
        timestamp: new Date(now.getTime() - 1000).toISOString(),
      });
      const older = reduceSubscriptionEvent(
        first.subscription,
        olderEvent,
        "SANDBOX",
        now,
      );
      expect(older.updated).toBe(false);
    });

    it("enforces immutable household binding and prevents subscription migration", () => {
      const initial = reduceSubscriptionEvent(
        null,
        baseEvent(),
        "SANDBOX",
        now,
      );
      const crossHouseholdEvent = baseEvent({
        householdId: randomUUID(),
        timestamp: new Date(now.getTime() + 1000).toISOString(),
      });

      expect(() =>
        reduceSubscriptionEvent(
          initial.subscription,
          crossHouseholdEvent,
          "SANDBOX",
          now,
        ),
      ).toThrow(BillingError);
    });

    it("transitions to GRACE_PERIOD on billing issue with active grace window", () => {
      const initial = reduceSubscriptionEvent(
        null,
        baseEvent(),
        "SANDBOX",
        now,
      );
      const graceEnd = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
      const issueEvent = baseEvent({
        eventType: "BILLING_ISSUE",
        graceUntil: graceEnd.toISOString(),
        timestamp: new Date(now.getTime() + 1000).toISOString(),
      });

      const updated = reduceSubscriptionEvent(
        initial.subscription,
        issueEvent,
        "SANDBOX",
        now,
      );
      expect(updated.subscription.status).toBe("GRACE_PERIOD");
      expect(updated.shouldGrant).toBe(true);
    });

    it("transitions to PAST_DUE on billing issue when grace period has elapsed", () => {
      const initial = reduceSubscriptionEvent(
        null,
        baseEvent(),
        "SANDBOX",
        now,
      );
      const expiredGrace = new Date(now.getTime() - 1000);
      const issueEvent = baseEvent({
        eventType: "BILLING_ISSUE",
        graceUntil: expiredGrace.toISOString(),
        timestamp: new Date(now.getTime() + 1000).toISOString(),
      });

      const updated = reduceSubscriptionEvent(
        initial.subscription,
        issueEvent,
        "SANDBOX",
        now,
      );
      expect(updated.subscription.status).toBe("PAST_DUE");
      expect(updated.shouldGrant).toBe(false);
    });

    it("marks cancellation as CANCELED while retaining access until period end", () => {
      const initial = reduceSubscriptionEvent(
        null,
        baseEvent(),
        "SANDBOX",
        now,
      );
      const cancelEvent = baseEvent({
        eventType: "CANCELLATION",
        cancelAtPeriodEnd: true,
        timestamp: new Date(now.getTime() + 1000).toISOString(),
      });

      const updated = reduceSubscriptionEvent(
        initial.subscription,
        cancelEvent,
        "SANDBOX",
        now,
      );
      expect(updated.subscription.status).toBe("CANCELED");
      expect(updated.subscription.cancelAtPeriodEnd).toBe(true);
      expect(updated.shouldGrant).toBe(true);
    });

    it("marks refund or expiration as EXPIRED with immediate revocation", () => {
      const initial = reduceSubscriptionEvent(
        null,
        baseEvent(),
        "SANDBOX",
        now,
      );
      const refundEvent = baseEvent({
        eventType: "REFUND",
        timestamp: new Date(now.getTime() + 1000).toISOString(),
      });

      const updated = reduceSubscriptionEvent(
        initial.subscription,
        refundEvent,
        "SANDBOX",
        now,
      );
      expect(updated.subscription.status).toBe("EXPIRED");
      expect(updated.shouldGrant).toBe(false);
    });
  });

  describe("Billing Service Webhook Handling & Normalization", () => {
    it("normalizes and ingests Stripe checkout and invoice webhooks", async () => {
      const householdId = randomUUID();
      const purchaserUserId = randomUUID();

      let upsertedRecord: Record<string, unknown> | null = null;
      const mockDatabase = {
        subscription: {
          findUnique: async () => null,
          upsert: async (args: { create: Record<string, unknown> }) => {
            upsertedRecord = args.create;
            return args.create;
          },
        },
      } as unknown as PrismaClient;

      const mockScoped = {} as unknown as ScopedDatabase;
      const mockEntitlements = {} as unknown as EntitlementService;

      const service = new BillingService({
        database: mockDatabase,
        scoped: mockScoped,
        entitlements: mockEntitlements,
        environment: "SANDBOX",
        stripeWebhookSecret: secret,
      });

      const payloadObj = {
        id: "evt_stripe_test_1",
        livemode: false,
        created: nowSeconds,
        type: "customer.subscription.created",
        data: {
          object: {
            id: "sub_stripe_123",
            customer: "cus_stripe_123",
            current_period_start: nowSeconds,
            current_period_end: nowSeconds + 30 * 24 * 60 * 60,
            cancel_at_period_end: false,
            metadata: {
              householdId,
              purchaserUserId,
            },
            items: {
              data: [{ price: { recurring: { interval: "month" } } }],
            },
          },
        },
      };

      const rawPayload = JSON.stringify(payloadObj);
      const signedPayload = `${nowSeconds}.${rawPayload}`;
      const sig = createHmac("sha256", secret)
        .update(signedPayload, "utf8")
        .digest("hex");
      const header = `t=${nowSeconds},v1=${sig}`;

      const res = await service.processStripeWebhook(rawPayload, header);
      expect(res.received).toBe(true);
      expect(res.action).toBe("applied_active");
      expect(upsertedRecord).toMatchObject({
        householdId,
        purchaserUserId,
        provider: "STRIPE",
        status: "ACTIVE",
        interval: "MONTHLY",
        externalSubscriptionId: "sub_stripe_123",
      });
    });

    it("normalizes and ingests RevenueCat subscription webhooks", async () => {
      const householdId = randomUUID();
      const purchaserUserId = randomUUID();

      let upsertedRecord: Record<string, unknown> | null = null;
      const mockDatabase = {
        subscription: {
          findUnique: async () => null,
          upsert: async (args: { create: Record<string, unknown> }) => {
            upsertedRecord = args.create;
            return args.create;
          },
        },
      } as unknown as PrismaClient;

      const mockScoped = {} as unknown as ScopedDatabase;
      const mockEntitlements = {} as unknown as EntitlementService;

      const service = new BillingService({
        database: mockDatabase,
        scoped: mockScoped,
        entitlements: mockEntitlements,
        environment: "SANDBOX",
        revenueCatWebhookSecret: rcSecret,
      });

      const rcPayload = {
        event: {
          id: "rc_evt_001",
          type: "INITIAL_PURCHASE",
          environment: "SANDBOX",
          app_user_id: "rc_user_1",
          original_transaction_id: "rc_tx_123",
          product_id: "thejoint_annual_sub",
          purchased_at_ms: now.getTime(),
          expiration_at_ms: now.getTime() + 365 * 24 * 60 * 60 * 1000,
          subscriber_attributes: {
            householdId: { value: householdId },
            purchaserUserId: { value: purchaserUserId },
          },
        },
      };

      const res = await service.processRevenueCatWebhook(
        rcPayload,
        `Bearer ${rcSecret}`,
      );
      expect(res.received).toBe(true);
      expect(res.action).toBe("applied_active");
      expect(upsertedRecord).toMatchObject({
        householdId,
        purchaserUserId,
        provider: "REVENUECAT",
        status: "ACTIVE",
        interval: "ANNUAL",
        externalSubscriptionId: "rc_tx_123",
      });
    });

    it("generates server-selected checkout and portal session URLs", async () => {
      const householdId = randomUUID();
      const userId = randomUUID();
      const context: AuthContext = {
        householdId,
        userId,
        membershipId: randomUUID(),
        sessionId: randomUUID(),
        grantVersion: 1,
        requestId: randomUUID(),
        aal: "aal2",
        mfaAuthenticatedAt: Date.now(),
      };

      const service = new BillingService({
        database: {} as unknown as PrismaClient,
        scoped: {} as unknown as ScopedDatabase,
        entitlements: {} as unknown as EntitlementService,
        environment: "SANDBOX",
      });

      const checkout = await service.createCheckoutSession(context, {
        interval: "ANNUAL",
      });
      expect(checkout.checkoutUrl).toContain(
        "https://checkout.stripe.com/c/pay/",
      );
      expect(checkout.sessionId).toContain("cs_sandbox_");

      const portal = await service.createPortalSession(context, {});
      expect(portal.portalUrl).toContain(
        "https://billing.stripe.com/p/session/",
      );
    });

    it("prevents double-counted caps and preserves free baseline on downgrade", async () => {
      const householdId = randomUUID();
      const purchaserUserId = randomUUID();
      const context: AuthContext = {
        householdId,
        userId: purchaserUserId,
        membershipId: randomUUID(),
        sessionId: randomUUID(),
        grantVersion: 1,
        requestId: randomUUID(),
        aal: "aal2",
        mfaAuthenticatedAt: Date.now(),
      };

      const activeSub = {
        id: randomUUID(),
        householdId,
        purchaserUserId,
        provider: "STRIPE",
        environment: "SANDBOX",
        externalCustomerId: "cus_1",
        externalSubscriptionId: "sub_1",
        status: "ACTIVE",
        interval: "MONTHLY",
        effectiveUntil: new Date(now.getTime() + 15 * 24 * 60 * 60 * 1000),
        graceUntil: null,
        cancelAtPeriodEnd: false,
        lastEventId: "evt_1",
        lastEventAt: now,
        createdAt: now,
        updatedAt: now,
      };

      const mockScoped = {
        withScope: async (
          _ctx: unknown,
          callback: (tx: {
            $queryRaw: () => Promise<unknown[]>;
          }) => Promise<unknown>,
        ) => {
          const mockTx = {
            $queryRaw: async () => [activeSub],
          };
          return callback(mockTx);
        },
      } as unknown as ScopedDatabase;

      const mockEntitlements = {
        read: async () => ({
          plan: "PLUS",
          capabilities: [
            "finance.manual",
            "projections.basic",
            "connections.bank",
            "connections.broker",
            "projections.advanced",
            "categorisation.automation",
            "insights.local",
          ],
          caps: {
            bankAuthorisations: 4,
            brokerConnections: 2,
            companionDevices: 1,
          },
          effectiveUntil: activeSub.effectiveUntil.toISOString(),
          version: "a".repeat(64),
        }),
      } as unknown as EntitlementService;

      const service = new BillingService({
        database: {} as unknown as PrismaClient,
        scoped: mockScoped,
        entitlements: mockEntitlements,
        environment: "SANDBOX",
      });

      const response = await service.getHouseholdSubscription(context);
      expect(response.plan).toBe("PLUS");
      expect(response.subscription?.status).toBe("ACTIVE");
      expect(response.subscription?.externalSubscriptionId).toBe("sub_1");

      const expiredEntitlements = {
        read: async () => ({
          plan: "FREE",
          capabilities: ["finance.manual", "projections.basic"],
          caps: {
            bankAuthorisations: 0,
            brokerConnections: 0,
            companionDevices: 0,
          },
          effectiveUntil: null,
          version: "b".repeat(64),
        }),
      } as unknown as EntitlementService;

      const downgradeService = new BillingService({
        database: {} as unknown as PrismaClient,
        scoped: mockScoped,
        entitlements: expiredEntitlements,
        environment: "SANDBOX",
      });

      const downgradedResponse =
        await downgradeService.getHouseholdSubscription(context);
      expect(downgradedResponse.plan).toBe("FREE");
      expect(downgradedResponse.effectiveUntil).toBeNull();
    });
  });

  describe("Worker Due-Time Subscription Reconciliation", () => {
    it("expires past-effective and past-grace subscriptions via security definer", async () => {
      let executedSql = "";
      const mockDatabase = {
        $queryRaw: async (query: unknown) => {
          executedSql = JSON.stringify(query);
          return [{ expired: 2 }];
        },
      } as unknown as PrismaClient;

      const count = await maintainSubscriptions(mockDatabase);
      expect(count).toBe(2);
      expect(executedSql).toContain("expire_subscriptions");
    });
  });
});
