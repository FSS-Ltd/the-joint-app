import { createHash, randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import { createOrm } from "../packages/database/dist/client.js";
import { DeletionRepository } from "../packages/database/dist/deletion.repository.js";
import { createFixtureOwner } from "./fixtures/database.js";

it("backs off failed and abandoned requests so newer deletions still finish", async () => {
  if (!process.env.DATABASE_URL)
    throw new Error("Runtime database URL required");
  const owner = createFixtureOwner(),
    runtime = createOrm(process.env.DATABASE_URL);
  const repository = new DeletionRepository(runtime),
    users: string[] = [],
    requests: string[] = [];
  const receiptHash = createHash("sha256").update(randomUUID()).digest("hex");
  async function request(day: number) {
    const userId = randomUUID(),
      sessionId = randomUUID(),
      id = randomUUID();
    users.push(userId);
    requests.push(id);
    await owner.user.create({
      data: {
        id: userId,
        sessions: {
          create: { id: sessionId, expiresAt: new Date(Date.now() + 600000) },
        },
      },
    });
    await repository.request(
      {
        userId,
        sessionId,
        aal: "aal2",
        mfaAuthenticatedAt: Date.now() - 1000,
        requestId: randomUUID(),
      },
      id,
      receiptHash,
      new Date(Date.now() + 86400000),
    );
    await owner.$executeRaw`UPDATE app."DeletionRequest" SET "requestedAt"=${new Date(`2000-01-0${day}T00:00:00Z`)}::timestamptz WHERE id=${id}::uuid`;
    return id;
  }
  try {
    const first = await request(1),
      second = await request(2);
    const lease = await repository.claim();
    expect(lease?.id).toBe(first);
    if (!lease) throw new Error("Missing first lease");
    await repository.purge(first, lease.leaseToken);
    await repository.finish(first, lease.leaseToken, false);
    const next = await repository.claim();
    expect(next?.id).toBe(second);
    if (!next) throw new Error("Missing newer request lease");
    expect(await repository.claim(first)).toBeNull();
    await repository.purge(second, next.leaseToken);
    await repository.finish(second, next.leaseToken, true);
    expect(await repository.status(first, receiptHash)).toMatchObject({
      state: "PROVIDER_PENDING",
      completedAt: null,
    });
    expect(await repository.status(second, receiptHash)).toMatchObject({
      state: "COMPLETED",
    });
    const [failure] = await owner.$queryRaw<
      { attempt: number; scheduled: boolean; bounded: boolean }[]
    >`SELECT attempt,"runAfter">clock_timestamp() AS scheduled,"runAfter"<=clock_timestamp()+interval '15 minutes' AS bounded FROM app."DeletionRequest" WHERE id=${first}::uuid`;
    expect(failure).toEqual({ attempt: 1, scheduled: true, bounded: true });
    await owner.$executeRaw`UPDATE app."DeletionRequest" SET "runAfter"=clock_timestamp()-interval '1 second' WHERE id=${first}::uuid`;
    const abandoned = await repository.claim(first);
    if (!abandoned) throw new Error("Missing retry lease");
    await owner.$executeRaw`UPDATE app."DeletionRequest" SET "leaseUntil"=clock_timestamp()-interval '1 second' WHERE id=${first}::uuid`;
    expect(await repository.claim(first)).toBeNull();
    const third = await request(3),
      later = await repository.claim();
    expect(later?.id).toBe(third);
    if (!later) throw new Error("Missing later request lease");
    await repository.purge(third, later.leaseToken);
    await repository.finish(third, later.leaseToken, true);
    const [retry] = await owner.$queryRaw<
      { attempt: number; delayed: boolean }[]
    >`SELECT attempt,"runAfter">clock_timestamp() AS delayed FROM app."DeletionRequest" WHERE id=${first}::uuid`;
    expect(retry).toEqual({ attempt: 2, delayed: true });
    await owner.$executeRaw`UPDATE app."DeletionRequest" SET attempt=30,"runAfter"=clock_timestamp()-interval '1 second' WHERE id=${first}::uuid`;
    const eventual = await repository.claim(first);
    if (!eventual) throw new Error("Missing eventual lease");
    await repository.finish(first, eventual.leaseToken, false);
    const [capped] = await owner.$queryRaw<
      { seconds: number }[]
    >`SELECT extract(epoch FROM "runAfter"-clock_timestamp())::float8 AS seconds FROM app."DeletionRequest" WHERE id=${first}::uuid`;
    expect(capped?.seconds).toBeGreaterThan(890);
    expect(capped?.seconds).toBeLessThanOrEqual(900);
    await owner.$executeRaw`UPDATE app."DeletionRequest" SET "runAfter"=clock_timestamp()-interval '1 second' WHERE id=${first}::uuid`;
    const success = await repository.claim(first);
    if (!success) throw new Error("Missing success lease");
    await repository.finish(first, success.leaseToken, true);
    expect(await repository.status(first, receiptHash)).toMatchObject({
      state: "COMPLETED",
    });
  } finally {
    await owner.sessionRegistry.deleteMany({
      where: { userId: { in: users } },
    });
    await owner.auditEvent.deleteMany({ where: { userId: { in: users } } });
    await owner.$executeRaw`DELETE FROM app."DeletionRequest" WHERE id=ANY(${requests}::uuid[])`;
    await owner.user.deleteMany({ where: { id: { in: users } } });
    await Promise.all([owner.$disconnect(), runtime.$disconnect()]);
  }
});
