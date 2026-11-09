import {
  createHash,
  createHmac,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
import type {
  BillingEnvironment,
  BillingInterval,
  BillingProvider,
  NormalizedSubscriptionEvent,
  SubscriptionStatus,
} from "@joint/contracts";

export class BillingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BillingError";
  }
}

export interface SubscriptionRecord {
  readonly id: string;
  readonly householdId: string;
  readonly purchaserUserId: string;
  readonly provider: BillingProvider;
  readonly environment: BillingEnvironment;
  readonly externalCustomerId: string;
  readonly externalSubscriptionId: string;
  readonly status: SubscriptionStatus;
  readonly interval: BillingInterval;
  readonly effectiveUntil: Date;
  readonly graceUntil: Date | null;
  readonly cancelAtPeriodEnd: boolean;
  readonly lastEventId: string | null;
  readonly lastEventAt: Date | null;
}

export interface ReducerResult {
  readonly updated: boolean;
  readonly subscription: SubscriptionRecord;
  readonly shouldGrant: boolean;
  readonly reason?: string;
}

/**
 * Verify Stripe webhook signature header (t=...,v1=...).
 * Enforces tolerance and constant-time signature comparison.
 */
export function verifyStripeWebhookSignature(
  payload: string | Buffer,
  signatureHeader: string | null | undefined,
  secret: string,
  nowSeconds = Math.floor(Date.now() / 1000),
  toleranceSeconds = 300,
): boolean {
  if (!signatureHeader || !secret) return false;

  const parts = signatureHeader.split(",");
  let timestamp: number | null = null;
  const signatures: string[] = [];

  for (const part of parts) {
    const [key, value] = part.split("=");
    if (key === "t" && value) {
      const parsed = parseInt(value, 10);
      if (!Number.isNaN(parsed)) timestamp = parsed;
    } else if (key === "v1" && value) {
      signatures.push(value);
    }
  }

  if (timestamp === null || signatures.length === 0) return false;

  // Enforce tolerance window against replay attacks
  if (Math.abs(nowSeconds - timestamp) > toleranceSeconds) {
    return false;
  }

  const payloadString =
    typeof payload === "string" ? payload : payload.toString("utf8");
  const signedPayload = `${timestamp}.${payloadString}`;
  const expectedSignature = createHmac("sha256", secret)
    .update(signedPayload, "utf8")
    .digest("hex");

  const expectedBuffer = Buffer.from(expectedSignature, "hex");

  for (const sig of signatures) {
    const sigBuffer = Buffer.from(sig, "hex");
    if (
      sigBuffer.length === expectedBuffer.length &&
      timingSafeEqual(sigBuffer, expectedBuffer)
    ) {
      return true;
    }
  }

  return false;
}

/**
 * Verify RevenueCat webhook authorization token using constant-time comparison.
 */
export function verifyRevenueCatWebhookAuth(
  authHeader: string | null | undefined,
  expectedSecret: string,
): boolean {
  if (!authHeader || !expectedSecret) return false;

  const expectedHeader = `Bearer ${expectedSecret}`;
  const headerHash = createHash("sha256").update(authHeader, "utf8").digest();
  const expectedHash = createHash("sha256")
    .update(expectedHeader, "utf8")
    .digest();

  return timingSafeEqual(headerHash, expectedHash);
}

/**
 * Pure state reducer applying normalized billing events to subscription state.
 */
export function reduceSubscriptionEvent(
  current: SubscriptionRecord | null,
  event: NormalizedSubscriptionEvent,
  systemEnvironment: BillingEnvironment,
  now: Date = new Date(),
): ReducerResult {
  // 1. Sandbox and production isolation
  if (systemEnvironment === "PRODUCTION" && event.environment === "SANDBOX") {
    throw new BillingError("Sandbox events rejected in production context.");
  }

  const eventTime = new Date(event.timestamp).getTime();

  // 2. Out-of-order and replay detection
  if (current !== null) {
    const lastTime = current.lastEventAt ? current.lastEventAt.getTime() : 0;

    if (eventTime <= lastTime) {
      return {
        updated: false,
        subscription: current,
        shouldGrant:
          current.status === "ACTIVE" || current.status === "GRACE_PERIOD",
        reason: "Replay or older event ignored.",
      };
    }

    // 3. Immutable purchaser-household binding
    if (current.householdId !== event.householdId) {
      throw new BillingError(
        "Subscription binding is immutable and cannot transfer across households.",
      );
    }
  }

  // 4. Derive subscription status from event type and timestamps
  let nextStatus: SubscriptionStatus;
  const effectiveUntilDate = new Date(event.effectiveUntil);
  const graceUntilDate = event.graceUntil ? new Date(event.graceUntil) : null;
  const isPastEffective = now.getTime() >= effectiveUntilDate.getTime();
  const isPastGrace = graceUntilDate
    ? now.getTime() >= graceUntilDate.getTime()
    : true;

  switch (event.eventType) {
    case "INITIAL_PURCHASE":
    case "RENEWAL":
    case "PRODUCT_CHANGE":
      nextStatus = isPastEffective
        ? isPastGrace
          ? "EXPIRED"
          : "GRACE_PERIOD"
        : "ACTIVE";
      break;

    case "BILLING_ISSUE":
      nextStatus = !isPastGrace ? "GRACE_PERIOD" : "PAST_DUE";
      break;

    case "CANCELLATION":
      nextStatus = isPastEffective ? "EXPIRED" : "CANCELED";
      break;

    case "EXPIRATION":
    case "REFUND":
      nextStatus = "EXPIRED";
      break;
  }

  const updatedSubscription: SubscriptionRecord = {
    id: current?.id ?? randomUUID(),
    householdId: event.householdId,
    purchaserUserId: event.purchaserUserId,
    provider: event.provider,
    environment: event.environment,
    externalCustomerId: event.externalCustomerId,
    externalSubscriptionId: event.externalSubscriptionId,
    status: nextStatus,
    interval: event.interval,
    effectiveUntil: effectiveUntilDate,
    graceUntil: graceUntilDate,
    cancelAtPeriodEnd: event.cancelAtPeriodEnd,
    lastEventId: event.eventId,
    lastEventAt: new Date(event.timestamp),
  };

  const shouldGrant =
    nextStatus === "ACTIVE" ||
    nextStatus === "CANCELED" ||
    nextStatus === "GRACE_PERIOD";

  return {
    updated: true,
    subscription: updatedSubscription,
    shouldGrant,
  };
}
