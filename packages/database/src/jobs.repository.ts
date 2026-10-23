import { randomUUID } from "node:crypto";
import type { PrismaClient, Prisma } from "./client.js";

export interface EnqueueJob {
  householdId: string;
  type: string;
  resourceId: string;
  idempotencyKey: string;
  payload: Prisma.InputJsonValue;
  maxAttempts?: number;
}
export interface JobLease {
  id: string;
  householdId: string;
  type: string;
  resourceId: string;
  payload: Prisma.JsonValue;
  attempt: number;
  leaseToken: string;
}
class LeaseExpired extends Error {}

export class JobsRepository {
  constructor(private readonly database: PrismaClient) {}

  async enqueue(input: EnqueueJob): Promise<{ id: string; type: string }> {
    if (
      input.maxAttempts !== undefined &&
      (!Number.isInteger(input.maxAttempts) ||
        input.maxAttempts < 1 ||
        input.maxAttempts > 10)
    )
      throw new Error("Job maxAttempts must be between 1 and 10");
    return this.database.job.upsert({
      where: {
        householdId_type_idempotencyKey: {
          householdId: input.householdId,
          type: input.type,
          idempotencyKey: input.idempotencyKey,
        },
      },
      create: input,
      update: {},
      select: { id: true, type: true },
    });
  }

  async claim(
    owner: string,
    types: readonly string[],
    leaseMs: number,
    jobId?: string,
  ): Promise<JobLease | null> {
    if (!types.length) return null;
    if (
      !owner ||
      !Number.isInteger(leaseMs) ||
      leaseMs < 10 ||
      leaseMs > 300_000
    )
      throw new Error(
        "Job lease must be 10–300000 milliseconds with a worker owner",
      );
    const token = randomUUID();
    return this.database.$transaction(async (tx) => {
      await tx.$executeRaw`UPDATE app."Job" SET state = 'FAILED', "leaseToken" = NULL, "leaseOwner" = NULL, "leaseUntil" = NULL WHERE state = 'LEASED' AND "leaseUntil" <= clock_timestamp() AND attempt >= "maxAttempts"`;
      const rows = await tx.$queryRaw<JobLease[]>`
        WITH candidate AS (
          SELECT id FROM app."Job"
          WHERE type = ANY(${[...types]}::text[])
            AND (${jobId ?? null}::uuid IS NULL OR id = ${jobId ?? null}::uuid)
            AND attempt < "maxAttempts"
            AND ((state IN ('QUEUED', 'RETRY_WAIT') AND "runAfter" <= clock_timestamp())
              OR (state = 'LEASED' AND "leaseUntil" <= clock_timestamp()))
          ORDER BY "runAfter", "createdAt", id FOR UPDATE SKIP LOCKED LIMIT 1
        )
        UPDATE app."Job" AS job SET state = 'LEASED', attempt = attempt + 1,
          "leaseOwner" = ${owner}, "leaseToken" = ${token}::uuid,
          "leaseUntil" = clock_timestamp() + ${leaseMs} * interval '1 millisecond'
        FROM candidate WHERE job.id = candidate.id
        RETURNING job.id, job."householdId", job.type, job."resourceId", job.payload, job.attempt, job."leaseToken"
      `;
      return rows[0] ?? null;
    });
  }

  async heartbeat(lease: JobLease, leaseMs: number): Promise<boolean> {
    if (!Number.isInteger(leaseMs) || leaseMs < 10 || leaseMs > 300_000)
      throw new Error("Job lease must be 10–300000 milliseconds");
    return (
      (await this.database.$executeRaw`
      UPDATE app."Job" SET "leaseUntil" = clock_timestamp() + ${leaseMs} * interval '1 millisecond'
      WHERE id = ${lease.id}::uuid AND state = 'LEASED' AND "leaseToken" = ${lease.leaseToken}::uuid AND "leaseUntil" > clock_timestamp()
    `) === 1
    );
  }

  async complete(
    lease: JobLease,
    apply: (tx: Prisma.TransactionClient) => Promise<void>,
    timeoutMs = 5000,
  ): Promise<boolean> {
    try {
      return await this.database.$transaction(
        async (tx) => {
          const rows = await tx.$queryRaw<
            { id: string }[]
          >`SELECT id FROM app."Job" WHERE id = ${lease.id}::uuid AND state = 'LEASED' AND "leaseToken" = ${lease.leaseToken}::uuid AND "leaseUntil" > clock_timestamp() FOR UPDATE`;
          if (!rows.length) return false;
          await apply(tx);
          const changed =
            await tx.$executeRaw`UPDATE app."Job" SET state = 'SUCCEEDED', "leaseOwner" = NULL, "leaseToken" = NULL, "leaseUntil" = NULL WHERE id = ${lease.id}::uuid AND "leaseUntil" > clock_timestamp()`;
          if (changed !== 1) throw new LeaseExpired();
          return true;
        },
        { timeout: timeoutMs, maxWait: Math.min(timeoutMs, 2000) },
      );
    } catch (error) {
      if (error instanceof LeaseExpired) return false;
      throw error;
    }
  }

  async fail(lease: JobLease, retrySeconds: number): Promise<boolean> {
    if (
      !Number.isFinite(retrySeconds) ||
      retrySeconds < 0 ||
      retrySeconds > 3600
    )
      throw new Error("Retry delay must be 0–3600 seconds");
    return (
      (await this.database.$executeRaw`
      UPDATE app."Job" SET state = CASE WHEN attempt >= "maxAttempts" THEN 'FAILED'::app."JobState" ELSE 'RETRY_WAIT'::app."JobState" END,
        "runAfter" = clock_timestamp() + ${retrySeconds} * interval '1 second', "leaseOwner" = NULL, "leaseToken" = NULL, "leaseUntil" = NULL
      WHERE id = ${lease.id}::uuid AND state = 'LEASED' AND "leaseToken" = ${lease.leaseToken}::uuid AND "leaseUntil" > clock_timestamp()
    `) === 1
    );
  }

  async cancel(householdId: string, id: string): Promise<boolean> {
    return (
      (
        await this.database.job.updateMany({
          where: {
            id,
            householdId,
            state: { in: ["QUEUED", "RETRY_WAIT", "LEASED"] },
          },
          data: {
            state: "CANCELLED",
            leaseOwner: null,
            leaseToken: null,
            leaseUntil: null,
          },
        })
      ).count === 1
    );
  }
}
