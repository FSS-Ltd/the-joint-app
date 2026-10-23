import { randomBytes, randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import { fundingEvidenceWriteSchema } from "../packages/contracts/dist/index.js";
import { FundingEvidenceService } from "../apps/api/src/modules/funding-evidence/funding-evidence.service.js";
import { IdentityVault } from "../apps/api/src/modules/identity/identity-vault.js";
import { createFundingEvidenceFixture } from "./fixtures/funding-evidence.js";
async function waitForBlockedWriter(
  f: ReturnType<typeof createFundingEvidenceFixture>,
  blocker: number,
): Promise<void> {
  for (let i = 0; i < 200; i++) {
    const [row] = await f.owner.$queryRaw<
      { blocked: boolean }[]
    >`SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE usename='joint_app_runtime' AND ${blocker}::integer=ANY(pg_blocking_pids(pid))) AS blocked`;
    if (row?.blocked) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw Error("Funding writer did not reach the verified lock barrier");
}
it.each(["SOURCE_CHANGE", "HOUSEHOLD_EXIT"] as const)(
  "rechecks authority and source after a verified lock wait: %s",
  async (change) => {
    const f = createFundingEvidenceFixture(),
      key = randomBytes(32).toString("base64"),
      service = new FundingEvidenceService(
        f.scoped,
        f.archive,
        new IdentityVault(key, key),
      ),
      requestKey = randomUUID();
    let pending: Promise<unknown> | undefined;
    try {
      await f.setup();
      await f.owner.$transaction(async (tx) => {
        const [backend] = await tx.$queryRaw<
          { pid: number }[]
        >`SELECT pg_backend_pid() AS pid`;
        if (!backend) throw Error("Missing blocker PID");
        await tx.$queryRaw`SELECT id FROM app."User" WHERE id=${f.a.userId}::uuid FOR UPDATE`;
        // Turn rejection into a value immediately, so no background rejection is lost.
        pending = service
          .write(
            f.a,
            f.account,
            0,
            fundingEvidenceWriteSchema.parse(f.data),
            requestKey,
          )
          .then(
            (value) => ({ value }),
            (error) => ({ error }),
          );
        await waitForBlockedWriter(f, backend.pid);
        if (change === "SOURCE_CHANGE") {
          await tx.balanceSnapshot.create({
            data: {
              id: randomUUID(),
              householdId: f.hh,
              accountId: f.account,
              authorMembershipId: f.a.membershipId,
              amountMinor: 100n,
              adultAmountMinor: 100n,
              asOfDate: new Date(new Date().toISOString().slice(0, 10)),
              createdAt: new Date(Date.now() + 1000),
            },
          });
        } else
          await tx.$queryRaw`SELECT app.exit_household_member(${f.a.userId}::uuid,${f.hh}::uuid,${f.a.membershipId}::uuid)`;
      });
      expect(await pending).toMatchObject({
        error: { status: change === "SOURCE_CHANGE" ? 409 : 401 },
      });
      expect(
        await f.owner.fundingEvidence.count({
          where: { accountId: f.account },
        }),
      ).toBe(0);
      expect(
        await f.owner.requestKey.count({
          where: { userId: f.a.userId, key: requestKey },
        }),
      ).toBe(0);
      expect(
        await f.owner.auditEvent.count({
          where: { userId: f.a.userId, action: "FUNDING_EVIDENCE_RECORDED" },
        }),
      ).toBe(0);
    } finally {
      await pending;
      await f.close();
    }
  },
);
