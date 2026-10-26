import { randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import {
  goalAllocationSetDtoSchema,
  goalAllocationPageSchema,
} from "../packages/contracts/dist/index.js";
import { createGoalAllocationHttpFixture } from "./fixtures/goal-allocation-http.js";

it("serves strict owner allocation APIs with required headers, safe conflicts and exact replay", async () => {
  const f = await createGoalAllocationHttpFixture();
  try {
    expect(
      (await f.request(f.path + f.query, "GET", undefined, "")).status,
    ).toBe(401);
    expect(
      (await f.request(f.path + f.query, "GET", undefined, f.memberToken))
        .status,
    ).toBe(404);
    expect(
      (await f.request(f.path + f.query, "GET", undefined, f.outsiderToken))
        .status,
    ).toBe(404);
    for (const suffix of [
      "",
      f.query + "&ownerId=" + randomUUID(),
      "?accountIds=" + f.accountId + "," + f.accountId.toUpperCase(),
    ])
      expect((await f.request(f.path + suffix)).status).toBe(400);
    const initial = await f.request(f.path + f.query);
    expect(initial.status).toBe(200);
    expect(initial.headers.get("cache-control")).toBe("no-store");
    expect(
      goalAllocationPageSchema.parse(await initial.json()).view.allocations,
    ).toEqual([]);
    const key = randomUUID(),
      headers = { "If-Match": '"1"', "Idempotency-Key": key };
    const missingHeaders: Record<string, string>[] = [
      {},
      { "If-Match": '"1"' },
      { "Idempotency-Key": key },
      { ...headers, "If-Match": "1" },
    ];
    for (const missing of missingHeaders)
      expect(
        (await f.request(f.path, "PUT", f.input(), undefined, missing)).status,
      ).toBe(400);
    expect(
      (
        await f.request(
          f.path,
          "PUT",
          { ...f.input(), ownerId: randomUUID() },
          undefined,
          headers,
        )
      ).status,
    ).toBe(400);
    const response = await f.request(
      f.path,
      "PUT",
      f.input(),
      undefined,
      headers,
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const made = goalAllocationSetDtoSchema.parse(await response.json());
    expect(made.positions[0]?.allocated?.amountMinor).toBe("30000");
    expect(
      goalAllocationSetDtoSchema.parse(
        await (
          await f.request(f.path, "PUT", f.input(), undefined, {
            ...headers,
            "Idempotency-Key": key.toUpperCase(),
          })
        ).json(),
      ),
    ).toEqual(made);
    expect(
      (await f.request(f.path, "PUT", f.input(0, "1"), undefined, headers))
        .status,
    ).toBe(409);
    expect(
      (
        await f.request(f.path, "PUT", f.input(), undefined, {
          ...headers,
          "Idempotency-Key": randomUUID(),
        })
      ).status,
    ).toBe(409);
    const exceeded = await f.request(
      f.path,
      "PUT",
      f.input(1, "60000"),
      undefined,
      { ...headers, "Idempotency-Key": randomUUID() },
    );
    expect(exceeded.status).toBe(409);
    expect(await exceeded.json()).toMatchObject({
      error: { code: "ALLOCATION_EXCEEDS_AVAILABLE" },
    });
    const exported = await f.request(f.path + "/export" + f.query);
    expect(exported.status).toBe(200);
    expect(exported.headers.get("cache-control")).toBe("no-store");
    expect(exported.headers.get("content-disposition")).toContain("attachment");
    expect(
      goalAllocationPageSchema.parse(await exported.json()).history,
    ).toHaveLength(1);
    await f.maintenance.account.update({
      where: { id: f.accountId },
      data: { liquidity: "RESTRICTED" },
    });
    const unavailable = await f.request(
      f.path,
      "PUT",
      f.input(1, "1"),
      undefined,
      { ...headers, "Idempotency-Key": randomUUID() },
    );
    expect(unavailable.status).toBe(409);
    expect(await unavailable.json()).toMatchObject({
      error: { code: "FUNDING_UNAVAILABLE" },
    });
    await f.maintenance.sessionRegistry.updateMany({
      where: { userId: f.account.creatorUserId },
      data: { revokedAt: new Date() },
    });
    const revoked = await f.request(
      f.path,
      "PUT",
      f.input(),
      undefined,
      headers,
    );
    expect(revoked.status).toBe(401);
    expect(JSON.stringify(await revoked.json())).not.toContain('"amountMinor"');
  } finally {
    await f.close();
  }
});

it("pages encrypted history and exposes only frozen owner archive exports after exit", async () => {
  const f = await createGoalAllocationHttpFixture();
  try {
    for (let version = 0; version < 52; version++) {
      const response = await f.request(
        f.path,
        "PUT",
        f.input(version, String(version + 1)),
        undefined,
        { "If-Match": '"1"', "Idempotency-Key": randomUUID() },
      );
      expect(response.status).toBe(200);
    }
    const first = goalAllocationPageSchema.parse(
      await (await f.request(f.path + f.query)).json(),
    );
    expect(first.history).toHaveLength(50);
    expect(first.nextCursor).toBeTruthy();
    const after = `&cursor=${encodeURIComponent(first.nextCursor ?? "")}`;
    expect(
      goalAllocationPageSchema
        .parse(await (await f.request(f.path + f.query + after)).json())
        .history.map((entry) => entry.version),
    ).toEqual([51, 52]);
    expect(
      (await f.request(`${f.path}?accountIds=${f.manualAccountId}${after}`))
        .status,
    ).toBe(400);
    expect((await f.request(f.path + f.query + "&cursor=forged")).status).toBe(
      400,
    );
    await f.maintenance
      .$queryRaw`SELECT app.exit_household_member(${f.account.creatorUserId}::uuid,${f.account.householdId}::uuid,${f.account.creatorMembershipId}::uuid)`;
    const token = await f.reauthenticateActor(),
      archive = `/me/archive/goals/${f.goalId}/allocations`;
    const frozen = await f.request(archive + f.query, "GET", undefined, token);
    expect(frozen.status).toBe(200);
    expect(frozen.headers.get("cache-control")).toBe("no-store");
    const page = goalAllocationPageSchema.parse(await frozen.json());
    expect(page.view.scope.sources[0]?.version).toBe(52);
    expect(page.view.positions[0]?.status).toBe("UNAVAILABLE");
    const exportPage = await f.request(
      archive + "/export" + f.query,
      "GET",
      undefined,
      token,
    );
    expect(exportPage.status).toBe(200);
    expect(exportPage.headers.get("content-disposition")).toContain(
      "attachment",
    );
    expect(
      goalAllocationPageSchema.parse(await exportPage.json()).history,
    ).toHaveLength(50);
    expect(
      (await f.request(archive + f.query + after, "GET", undefined, token))
        .status,
    ).toBe(400);
    expect(
      (
        await f.request(f.path, "PUT", f.input(), token, {
          "If-Match": '"1"',
          "Idempotency-Key": randomUUID(),
        })
      ).status,
    ).toBe(404);
    expect((await f.request(archive, "PUT", f.input(), token)).status).toBe(
      404,
    );
  } finally {
    await f.close();
  }
});
