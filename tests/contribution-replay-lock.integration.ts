import { randomBytes, randomUUID } from "node:crypto";
import { expect, it, vi } from "vitest";
import { ContributionService } from "../apps/api/src/modules/goals/contributions/contribution.service.js";
import { IdentityVault } from "../apps/api/src/modules/identity/identity-vault.js";
import { createContributionFixture } from "./fixtures/contribution-budget.js";
import { contributionCapacity } from "./fixtures/contribution-plans.js";

it("rechecks authority after a plan-cache wait before decrypting replay", async () => {
  const f = createContributionFixture();
  await f.setup();
  const encryptionKey = randomBytes(32).toString("base64"),
    vault = new IdentityVault(encryptionKey, encryptionKey),
    service = new ContributionService(f.scoped, f.archive, vault),
    requestKey = randomUUID();
  let pending: Promise<unknown> | undefined;
  try {
    await service.writeCapacity(f.a, 0, contributionCapacity, randomUUID());
    await service.writePlan(f.a, f.goalId, 1, f.planInput(), requestKey);
    const decrypt = vi.spyOn(vault, "open");
    await f.owner.$transaction(async (tx) => {
      await tx.$executeRaw`UPDATE app."ContributionPlan" SET version=2 WHERE "goalId"=${f.goalId}::uuid`;
      pending = service
        .writePlan(f.a, f.goalId, 1, f.planInput(), requestKey)
        .then(
          (value) => ({ value }),
          (error: unknown) => ({ error }),
        );
      await vi.waitFor(async () => {
        await tx.$executeRaw`SELECT pg_stat_clear_snapshot()`;
        const [row] = await tx.$queryRaw<{ waiting: boolean }[]>`
          SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE datname=current_database()
            AND query LIKE '%app.authorize_contribution_write%' AND wait_event_type='Lock'
            AND pg_backend_pid()=ANY(pg_blocking_pids(pid))) AS waiting`;
        expect(row?.waiting).toBe(true);
      });
      await tx.sessionRegistry.update({
        where: { id: f.a.sessionId },
        data: { expiresAt: new Date(Date.now() - 1000) },
      });
    });
    expect(await pending).toMatchObject({ error: { status: 404 } });
    expect(decrypt).not.toHaveBeenCalled();
  } finally {
    await pending;
    vi.restoreAllMocks();
    await f.close();
  }
});
