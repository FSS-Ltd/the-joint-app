import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createContributionFixture } from "./fixtures/contribution-budget.js";
import { contributionCapacity } from "./fixtures/contribution-plans.js";
import { databaseErrorCode } from "../apps/api/src/database-error.js";

const f = createContributionFixture();
beforeAll(f.setup);
afterAll(f.close);
describe("private contribution storage", () => {
  it("keeps all three new tables inaccessible to the runtime role", async () => {
    const [row] = await f.owner.$queryRaw<{ count: bigint }[]>`
      SELECT count(*) AS count FROM app."ContributionBudget" WHERE "householdId"=${f.hh}::uuid`;
    expect(row?.count).toBe(0n);
    for (const table of [
      "ContributionBudget",
      "ContributionBudgetParticipant",
      "ContributionBudgetRevision",
    ]) {
      await expect(
        f.scoped
          .withScope(f.a, (tx) =>
            tx.$queryRawUnsafe(`SELECT * FROM app."${table}" LIMIT 1`),
          )
          .catch(databaseErrorCode),
      ).resolves.toBe("42501");
    }
  });
  it("protects retained immutable history and rejects cross-tenant participation", async () => {
    const id = randomUUID(),
      now = new Date("2026-10-26T20:00:00.000Z");
    await f.owner
      .$executeRaw`INSERT INTO app."ContributionBudget"(id,"householdId",version,"updatedAt") VALUES(${id}::uuid,${f.hh}::uuid,1,${now})`;
    await f.owner
      .$executeRaw`INSERT INTO app."ContributionBudgetParticipant"("householdId","budgetId","membershipId") VALUES(${f.hh}::uuid,${id}::uuid,${f.a.membershipId}::uuid)`;
    const change = JSON.stringify({
      kind: "CAPACITY",
      capacity: contributionCapacity,
    });
    await f.owner
      .$executeRaw`INSERT INTO app."ContributionBudgetRevision"("householdId","budgetId",version,change,"createdAt") VALUES(${f.hh}::uuid,${id}::uuid,1,${change}::jsonb,${now})`;
    await expect(
      f.owner
        .$executeRaw`UPDATE app."ContributionBudgetRevision" SET "createdAt"=clock_timestamp() WHERE "budgetId"=${id}::uuid`.catch(
        databaseErrorCode,
      ),
    ).resolves.toBe("23514");
    await expect(
      f.owner
        .$executeRaw`DELETE FROM app."ContributionBudgetRevision" WHERE "budgetId"=${id}::uuid`.catch(
        databaseErrorCode,
      ),
    ).resolves.toBe("23514");
    await expect(
      f.owner
        .$executeRaw`INSERT INTO app."ContributionBudgetParticipant"("householdId","budgetId","membershipId") VALUES(${randomUUID()}::uuid,${id}::uuid,${f.b.membershipId}::uuid)`.catch(
        databaseErrorCode,
      ),
    ).resolves.toBe("23503");
    const [head] = await f.owner.$queryRaw<
      { createdAt: Date }[]
    >`SELECT "createdAt" FROM app."ContributionBudgetRevision" WHERE "budgetId"=${id}::uuid AND version=1`;
    expect(head?.createdAt).toEqual(now);
    for (const goalVersion of [
      undefined,
      "PRIVATE_INVALID",
      0,
      1.5,
      2147483648,
    ]) {
      const invalid = JSON.stringify({
        kind: "PLAN",
        entry: { goalVersion, plan: { goalId: f.goalId, householdId: f.hh } },
      });
      await expect(
        f.owner
          .$transaction(async (tx) => {
            await tx.$executeRaw`INSERT INTO app."ContributionBudgetRevision"("householdId","budgetId",version,"goalId",change) VALUES(${f.hh}::uuid,${id}::uuid,2,${f.goalId}::uuid,${invalid}::jsonb)`;
            throw new Error("Expected provenance rejection");
          })
          .catch(databaseErrorCode),
      ).resolves.toBe("23514");
    }
  });
  it("leaves legacy request rows unverified without inventing participants or history", async () => {
    const plan = await f.owner.contributionPlan.create({
      data: {
        householdId: f.hh,
        goalId: f.goalId,
        firstContributionDate: new Date("2026-11-30"),
        steps: {
          create: { fromMonth: 1, amountMinor: 25000n },
        },
      },
    });
    const [stored] = await f.owner.$queryRaw<
      { budgetId: string | null; sourceVersion: number | null }[]
    >`
      SELECT "budgetId","sourceVersion" FROM app."ContributionPlan" WHERE id=${plan.id}::uuid`;
    expect(stored).toEqual({ budgetId: null, sourceVersion: null });
    const [verified] = await f.owner.$queryRaw<
      { count: bigint }[]
    >`SELECT count(*) AS count FROM app."ContributionBudgetRevision" WHERE "goalId"=${f.goalId}::uuid`;
    expect(verified?.count).toBe(0n);
  });
});
