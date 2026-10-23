import { randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import {
  goalDtoSchema,
  goalPageDtoSchema,
  goalListDtoSchema,
} from "../packages/contracts/dist/index.js";
import { createImportsHttpFixture } from "./fixtures/imports-http.js";
it("serves shared metadata, versioned history and free authorized JSON export over real HTTP", async () => {
  const f = await createImportsHttpFixture(),
    id = randomUUID(),
    path = `${f.root}/goals/${id}`;
  const input = {
    name: "Synthetic household goal",
    status: "ACTIVE",
    beneficiary: "ADULT",
    priority: 1,
    target: { amountMinor: "9007199254740993", currency: "GBP" },
    targetDate: null,
  };
  try {
    expect((await f.request(path, "GET", undefined, "")).status).toBe(401);
    const key = randomUUID();
    const created = await f.request(
      `${f.root}/goals`,
      "POST",
      input,
      undefined,
      { "Idempotency-Key": key },
    );
    expect(created.status).toBe(201);
    const made = goalDtoSchema.parse(await created.json());
    const goalPath = `${f.root}/goals/${made.id}`;
    expect(
      goalDtoSchema.parse(
        await (
          await f.request(`${f.root}/goals`, "POST", input, undefined, {
            "Idempotency-Key": key,
          })
        ).json(),
      ).id,
    ).toBe(made.id);
    expect(
      (
        await f.request(
          `${f.root}/goals`,
          "POST",
          { ...input, name: "Different" },
          undefined,
          { "Idempotency-Key": key },
        )
      ).status,
    ).toBe(409);
    expect((await f.request(`${f.root}/goals`, "POST", input)).status).toBe(
      400,
    );
    const archiveList = await f.request("/me/archive/goals");
    expect(archiveList.status).toBe(200);
    expect(goalListDtoSchema.parse(await archiveList.json()).goals).toEqual([]);
    expect((await f.request(`/me/archive/goals/${made.id}`)).status).toBe(404);
    expect(
      (await f.request(`/me/archive/goals/${made.id}`, "PUT", input)).status,
    ).toBe(404);
    const response = await f.request(goalPath);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const first = goalPageDtoSchema.parse(await response.json());
    expect(first.goal.version).toBe(1);
    expect(
      (await f.request(goalPath, "GET", undefined, f.memberToken)).status,
    ).toBe(200);
    expect(
      (await f.request(goalPath, "GET", undefined, f.outsiderToken)).status,
    ).toBe(404);
    expect(
      (
        await f.request(
          goalPath,
          "PUT",
          { ...input, accountId: f.accountId },
          undefined,
          { "If-Match": '"1"' },
        )
      ).status,
    ).toBe(400);
    expect((await f.request(goalPath, "PUT", input)).status).toBe(400);
    const edit = await f.request(
      goalPath,
      "PUT",
      { ...input, name: "Edited shared target" },
      f.memberToken,
      { "If-Match": '"1"' },
    );
    expect(edit.status).toBe(200);
    expect(goalDtoSchema.parse(await edit.json()).version).toBe(2);
    expect(
      (
        await f.request(goalPath, "PUT", input, undefined, {
          "If-Match": '"1"',
        })
      ).status,
    ).toBe(409);
    expect((await f.request(`${goalPath}?cursor=bad`)).status).toBe(400);
    const list = goalListDtoSchema.parse(
      await (await f.request(`${f.root}/goals`)).json(),
    );
    expect(list.goals.map((g) => g.id)).toContain(made.id);
    const download = await f.request(`${goalPath}/export`);
    expect(download.status).toBe(200);
    expect(download.headers.get("content-disposition")).toBe(
      'attachment; filename="goal-history.json"',
    );
    expect(
      goalPageDtoSchema.parse(await download.json()).revisions,
    ).toHaveLength(2);
    expect(JSON.stringify(first)).not.toMatch(
      /accountId|allocation|funding|settled|description/,
    );
    const account = await f.maintenance.account.findUniqueOrThrow({
      where: { id: f.accountId },
    });
    await f.maintenance.sessionRegistry.updateMany({
      where: { userId: account.creatorUserId },
      data: { revokedAt: new Date() },
    });
    expect((await f.request(`${goalPath}/export`)).status).toBe(401);
  } finally {
    await f.close();
  }
});
