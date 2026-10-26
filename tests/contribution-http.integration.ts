import { randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import {
  contributionBudgetViewSchema,
  contributionPageSchema,
  contributionArchiveListSchema,
} from "../packages/contracts/dist/index.js";
import { createContributionHttpFixture } from "./fixtures/contribution-http.js";

it("requires strict auth, headers and bodies on contribution routes and returns exact replay", async () => {
  const f = await createContributionHttpFixture();
  try {
    expect((await f.request(f.path, "GET", undefined, "")).status).toBe(401);
    expect(
      (await f.request(f.path, "GET", undefined, f.outsiderToken)).status,
    ).toBe(404);
    expect((await f.request(f.path)).status).toBe(404);
    const key = randomUUID(),
      headers = { "If-Match": '"0"', "Idempotency-Key": key };
    const missingHeaders: Record<string, string>[] = [
      {},
      { "If-Match": '"0"' },
      { "Idempotency-Key": key },
      { ...headers, "If-Match": "0" },
    ];
    for (const missing of missingHeaders)
      expect(
        (await f.request(f.path, "PUT", f.capacity, undefined, missing)).status,
      ).toBe(400);
    expect(
      (
        await f.request(
          f.path,
          "PUT",
          { ...f.capacity, householdId: randomUUID() },
          undefined,
          headers,
        )
      ).status,
    ).toBe(400);
    const response = await f.request(
      f.path,
      "PUT",
      f.capacity,
      undefined,
      headers,
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const made = contributionBudgetViewSchema.parse(await response.json());
    expect(made.budget.version).toBe(1);
    expect(
      contributionBudgetViewSchema.parse(
        await (
          await f.request(f.path, "PUT", f.capacity, undefined, headers)
        ).json(),
      ),
    ).toEqual(made);
    expect(
      (
        await f.request(
          f.path,
          "PUT",
          { ...f.capacity, horizonMonths: 2 },
          undefined,
          headers,
        )
      ).status,
    ).toBe(409);
    expect(
      (
        await f.request(f.path, "PUT", f.capacity, undefined, {
          ...headers,
          "Idempotency-Key": randomUUID(),
        })
      ).status,
    ).toBe(409);
    expect(
      (await f.request(f.path + "?participant=" + randomUUID())).status,
    ).toBe(400);
    const plan = await f.request(f.planPath, "PUT", f.planInput, undefined, {
      "If-Match": '"1"',
      "Idempotency-Key": randomUUID(),
    });
    expect(plan.status).toBe(200);
    expect(
      contributionBudgetViewSchema.parse(await plan.json()).selectedPlan?.plan
        .goalId,
    ).toBe(f.goalId);
    expect(
      contributionBudgetViewSchema.parse(
        await (await f.request(f.path, "GET", undefined, f.memberToken)).json(),
      ).plans,
    ).toHaveLength(1);
    expect(
      (await f.request(f.path + "/export", "GET", undefined, f.memberToken))
        .status,
    ).toBe(403);
    for (const path of [f.path, f.planPath]) {
      const history = await f.request(path + "/history");
      expect(history.status).toBe(200);
      expect(
        contributionPageSchema.parse(await history.json()).history,
      ).toHaveLength(2);
      const exported = await f.request(path + "/export");
      expect(exported.status).toBe(200);
      expect(exported.headers.get("cache-control")).toBe("no-store");
      expect(exported.headers.get("content-disposition")).toContain(
        "attachment",
      );
    }
    const account = await f.maintenance.account.findUniqueOrThrow({
      where: { id: f.accountId },
    });
    await f.maintenance.sessionRegistry.updateMany({
      where: { userId: account.creatorUserId },
      data: { revokedAt: new Date() },
    });
    const revoked = await f.request(
      f.path,
      "PUT",
      f.capacity,
      undefined,
      headers,
    );
    expect(revoked.status).toBe(401);
    expect(JSON.stringify(await revoked.json())).not.toContain('"amountMinor"');
  } finally {
    await f.close();
  }
});

it("serves a captured read-only contribution archive after exit", async () => {
  const f = await createContributionHttpFixture();
  try {
    const created = await f.request(f.path, "PUT", f.capacity, undefined, {
      "If-Match": '"0"',
      "Idempotency-Key": randomUUID(),
    });
    expect(created.status).toBe(200);
    const budget = contributionBudgetViewSchema.parse(
      await created.json(),
    ).budget;
    expect(
      (
        await f.request(f.planPath, "PUT", f.planInput, undefined, {
          "If-Match": '"1"',
          "Idempotency-Key": randomUUID(),
        })
      ).status,
    ).toBe(200);
    const account = await f.maintenance.account.findUniqueOrThrow({
      where: { id: f.accountId },
    });
    await f.maintenance
      .$queryRaw`SELECT app.exit_household_member(${account.creatorUserId}::uuid,${account.householdId}::uuid,${account.creatorMembershipId}::uuid)`;
    const token = await f.reauthenticateActor(),
      archive = "/me/archive/contribution-budgets";
    const listed = await f.request(archive, "GET", undefined, token);
    expect(listed.status).toBe(200);
    expect(
      contributionArchiveListSchema.parse(await listed.json()).budgets,
    ).toEqual([{ id: budget.id, householdId: budget.householdId }]);
    for (const path of [
      `${archive}/${budget.id}`,
      `${archive}/${budget.id}/goals/${f.goalId}/contribution-plan`,
    ]) {
      const result = await f.request(path, "GET", undefined, token);
      expect(result.status).toBe(200);
      expect(
        contributionBudgetViewSchema.parse(await result.json()).budget.version,
      ).toBe(2);
      const history = await f.request(
        path + "/history",
        "GET",
        undefined,
        token,
      );
      expect(
        contributionPageSchema.parse(await history.json()).history,
      ).toHaveLength(2);
      expect(
        (await f.request(path + "/export", "GET", undefined, token)).status,
      ).toBe(200);
      expect((await f.request(path, "PUT", f.capacity, token)).status).toBe(
        404,
      );
    }
  } finally {
    await f.close();
  }
});
