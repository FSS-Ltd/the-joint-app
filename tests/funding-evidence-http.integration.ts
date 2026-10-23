import { randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import {
  fundingEvidenceDtoSchema,
  fundingEvidencePageSchema,
} from "../packages/contracts/dist/index.js";
import { createImportsHttpFixture } from "./fixtures/imports-http.js";
it("serves owner evidence, exact replay, bounded encrypted pages and free MFA export over HTTP", async () => {
  const f = await createImportsHttpFixture(),
    path = `${f.root}/accounts/${f.accountId}/funding-evidence`;
  try {
    const account = await f.maintenance.account.findUniqueOrThrow({
        where: { id: f.accountId },
      }),
      vid = "abcdefab-1234-4abc-8def-" + randomUUID().slice(-12);
    await f.maintenance.balanceSnapshot.create({
      data: {
        id: vid,
        householdId: account.householdId,
        accountId: account.id,
        authorMembershipId: account.creatorMembershipId,
        amountMinor: 9007199254740993n,
        adultAmountMinor: 9007199254740993n,
        asOfDate: new Date(new Date().toISOString().slice(0, 10)),
      },
    });
    const baseline = await f.maintenance.account.findUniqueOrThrow({
      where: { id: account.id },
    });
    const data = {
        valuationId: vid,
        settledAdultMoney: { amountMinor: "9007199254740993", currency: "GBP" },
        billReserves: { amountMinor: "0", currency: "GBP" },
      },
      key = "ABCDEFAB-1234-4ABC-8DEF-" + randomUUID().slice(-12).toUpperCase(),
      headers = { "If-Match": '"0"', "Idempotency-Key": key };
    expect((await f.request(path, "GET", undefined, "")).status).toBe(401);
    expect(
      (await f.request(path, "GET", undefined, f.memberToken)).status,
    ).toBe(404);
    expect(
      (await f.request(path, "GET", undefined, f.outsiderToken)).status,
    ).toBe(404);
    expect((await f.request(path, "POST", data)).status).toBe(400);
    const response = await f.request(path, "POST", data, undefined, headers);
    expect(response.status).toBe(201);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const made = fundingEvidenceDtoSchema.parse(await response.json());
    expect(made.version).toBe(1);
    expect(
      fundingEvidenceDtoSchema.parse(
        await (await f.request(path, "POST", data, undefined, headers)).json(),
      ),
    ).toEqual(made);
    const sameKey = await f.request(path, "POST", data, undefined, {
      ...headers,
      "Idempotency-Key": key.toLowerCase(),
    });
    expect(sameKey.status).toBe(201);
    expect(fundingEvidenceDtoSchema.parse(await sameKey.json())).toEqual(made);
    const equivalent = await f.request(
      path,
      "POST",
      { ...data, valuationId: vid.toUpperCase() },
      undefined,
      { ...headers, "Idempotency-Key": key.toLowerCase() },
    );
    expect(equivalent.status).toBe(201);
    expect(fundingEvidenceDtoSchema.parse(await equivalent.json())).toEqual(
      made,
    );

    expect(
      (
        await f.request(
          path,
          "POST",
          { ...data, billReserves: { amountMinor: "1", currency: "GBP" } },
          undefined,
          headers,
        )
      ).status,
    ).toBe(409);
    expect(
      (
        await f.request(path, "POST", data, undefined, {
          ...headers,
          "If-Match": '"1"',
        })
      ).status,
    ).toBe(409);
    expect(
      (
        await f.request(path, "POST", data, undefined, {
          ...headers,
          "Idempotency-Key": randomUUID(),
        })
      ).status,
    ).toBe(409);
    expect(
      (
        await f.request(
          path,
          "POST",
          { ...data, settledAdultMoney: { amountMinor: "1", currency: "GBP" } },
          undefined,
          { "If-Match": '"1"', "Idempotency-Key": randomUUID() },
        )
      ).status,
    ).toBe(409);
    for (let version = 1; version < 52; version++) {
      const r = await f.request(
        path,
        "POST",
        {
          ...data,
          billReserves: { amountMinor: String(version), currency: "GBP" },
        },
        undefined,
        { "If-Match": `"${version}"`, "Idempotency-Key": randomUUID() },
      );
      expect(r.status).toBe(201);
    }
    const first = fundingEvidencePageSchema.parse(
      await (await f.request(path)).json(),
    );
    expect(first.history).toHaveLength(50);
    expect(first.current?.version).toBe(52);
    expect(first.nextCursor).toBeTruthy();
    const next = `?cursor=${encodeURIComponent(first.nextCursor ?? "")}`;
    const second = fundingEvidencePageSchema.parse(
      await (await f.request(path + next)).json(),
    );
    expect(second.history.map((e) => e.version)).toEqual([51, 52]);
    expect(second.nextCursor).toBeNull();
    expect(
      (
        await f.request(
          `${f.root}/accounts/${f.manualAccountId}/funding-evidence${next}`,
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await f.request(
          `/me/archive/accounts/${f.accountId}/funding-evidence${next}`,
        )
      ).status,
    ).toBe(400);
    expect((await f.request(path + "?cursor=forged")).status).toBe(400);
    const exported = await f.request(path + "/export" + next);
    expect(exported.status).toBe(200);
    expect(exported.headers.get("content-disposition")).toContain("attachment");
    expect(
      fundingEvidencePageSchema.parse(await exported.json()).history,
    ).toHaveLength(2);
    const source = await f.maintenance.account.findUniqueOrThrow({
      where: { id: account.id },
    });
    expect([source.version, source.totalsVersion]).toEqual([
      baseline.version,
      baseline.totalsVersion,
    ]);

    await f.maintenance
      .$queryRaw`SELECT app.exit_household_member(${account.creatorUserId}::uuid,${account.householdId}::uuid,${account.creatorMembershipId}::uuid)`;
    const revokedReplay = await f.request(
      path,
      "POST",
      data,
      f.actorToken,
      headers,
    );
    expect(revokedReplay.status).toBe(401);
    expect(JSON.stringify(await revokedReplay.json())).not.toContain(
      made.settledAdultMoney.amountMinor,
    );
    const archiveToken = await f.reauthenticateActor(),
      archivePath = `/me/archive/accounts/${account.id}/funding-evidence`;
    const frozen = await f.request(archivePath, "GET", undefined, archiveToken);
    expect(frozen.status).toBe(200);
    expect(frozen.headers.get("cache-control")).toBe("no-store");
    expect(
      fundingEvidencePageSchema.parse(await frozen.json()).current?.version,
    ).toBe(52);
    const frozenExport = await f.request(
      archivePath + "/export",
      "GET",
      undefined,
      archiveToken,
    );
    expect(frozenExport.status).toBe(200);
    expect(frozenExport.headers.get("content-disposition")).toContain(
      "attachment",
    );
    expect(
      fundingEvidencePageSchema.parse(await frozenExport.json()).history,
    ).toHaveLength(50);
    expect(
      (await f.request(path, "POST", data, archiveToken, headers)).status,
    ).toBe(404);
  } finally {
    await f.close();
  }
});
