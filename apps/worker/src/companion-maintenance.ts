import type { PrismaClient } from "@joint/database/client";

/**
 * Reconcile companion job leases, timeouts, and expired pairing challenges at due-time.
 */
export async function maintainCompanionJobs(
  database: PrismaClient,
): Promise<{ recoveredLeases: number; expiredJobs: number }> {
  const now = new Date();

  // 1. Recover expired leases
  const expiredLeases = await database.insightJob.findMany({
    where: {
      status: "LEASED",
      leaseExpiresAt: { lt: now },
    },
    take: 50,
  });

  let recoveredLeases = 0;
  for (const job of expiredLeases) {
    if (job.attempts < job.maxAttempts) {
      await database.insightJob.update({
        where: { id: job.id },
        data: {
          status: "QUEUED",
          assignedDeviceId: null,
          leaseToken: null,
          leaseExpiresAt: null,
          updatedAt: now,
        },
      });
      recoveredLeases++;
    } else {
      await database.insightJob.update({
        where: { id: job.id },
        data: {
          status: "FAILED",
          leaseToken: null,
          leaseExpiresAt: null,
          updatedAt: now,
        },
      });
    }
  }

  // 2. Expire old queued jobs exceeding 24 hours
  const expiredResult = await database.insightJob.updateMany({
    where: {
      status: "QUEUED",
      expiresAt: { lt: now },
    },
    data: {
      status: "EXPIRED",
      updatedAt: now,
    },
  });

  // 3. Clear stale challenge nonces
  await database.deviceSession.deleteMany({
    where: {
      nonce: { not: null },
      nonceExpiresAt: { lt: now },
      tokenHash: { startsWith: "challenge_" },
    },
  });

  return {
    recoveredLeases,
    expiredJobs: expiredResult.count,
  };
}
