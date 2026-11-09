import type { PrismaClient } from "@joint/database/client";

/**
 * Reconcile subscription lifecycles at due-time.
 * Transitions past-effective and past-grace subscriptions to EXPIRED via security definer function.
 */
export async function maintainSubscriptions(
  database: PrismaClient,
): Promise<number> {
  const [result] = await database.$queryRaw<
    { expired: number }[]
  >`SELECT app.expire_subscriptions() AS expired`;
  return Number(result?.expired ?? 0);
}
