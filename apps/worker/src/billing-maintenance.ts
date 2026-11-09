import type { PrismaClient } from "@joint/database/client";

/**
 * Reconcile subscription lifecycles at due-time.
 * Transitions past-effective and past-grace subscriptions to EXPIRED.
 */
export async function maintainSubscriptions(
  database: PrismaClient,
): Promise<number> {
  const result = await database.$executeRaw`
    UPDATE app."Subscription"
    SET status = 'EXPIRED', "updatedAt" = clock_timestamp()
    WHERE status IN ('ACTIVE', 'GRACE_PERIOD', 'CANCELED')
      AND "effectiveUntil" < clock_timestamp()
      AND ("graceUntil" IS NULL OR "graceUntil" < clock_timestamp())
  `;
  return Number(result);
}
