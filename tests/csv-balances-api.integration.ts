import { randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import {
  accountSchema,
  csvBalanceListSchema,
  importJobResultSchema,
  transactionSchema,
} from "../packages/contracts/dist/index.js";
import { createImportsHttpFixture } from "./fixtures/imports-http.js";

it("derives account estimates from committed CSV with dated manual anchors and reversible publication", async () => {
  const f = await createImportsHttpFixture();
  const accountPath = `${f.root}/accounts/${f.accountId}`;
  const balancePath = `${f.root}/accounts/current-balances?accountIds=${f.accountId}`;
  const estimate = async (token = f.actorToken) => {
    const response = await f.request(balancePath, "GET", undefined, token);
    expect(response.status).toBe(200);
    return csvBalanceListSchema.parse(await response.json()).items[0];
  };
  try {
    expect(await estimate()).toEqual({
      accountId: f.accountId,
      status: "MISSING_ANCHOR",
    });
    const ownerAccount = await f.maintenance.account.findUniqueOrThrow({
      where: { id: f.accountId },
      select: { householdId: true, creatorMembershipId: true },
    });
    const future = await f.maintenance.balanceSnapshot.create({
      data: {
        householdId: ownerAccount.householdId,
        accountId: f.accountId,
        authorMembershipId: ownerAccount.creatorMembershipId,
        amountMinor: 500n,
        asOfDate: new Date("2099-01-01T00:00:00.000Z"),
      },
    });
    expect(await estimate()).toEqual({
      accountId: f.accountId,
      status: "MISSING_ANCHOR",
    });
    let account = accountSchema.parse(
      await (await f.request(accountPath)).json(),
    );
    const valued = await f.request(
      `${accountPath}/valuations`,
      "POST",
      {
        money: { amountMinor: "10000", currency: "GBP" },
        asOfDate: "2026-01-01",
        adultMoney: null,
      },
      f.actorToken,
      { "If-Match": `"${account.version}"`, "Idempotency-Key": randomUUID() },
    );
    expect(valued.status).toBe(200);
    account = accountSchema.parse(await valued.json());
    expect(account.latestValuation?.adultMoney).toBeNull();
    const opening = await f.maintenance.balanceSnapshot.findFirstOrThrow({
      where: {
        accountId: f.accountId,
        asOfDate: new Date("2026-01-01T00:00:00.000Z"),
      },
    });
    expect(await estimate()).toMatchObject({
      accountId: f.accountId,
      status: "AVAILABLE",
      money: { amountMinor: "10000" },
      anchorId: opening.id,
      anchorDate: "2026-01-01",
      throughDate: "2026-01-01",
    });
    const grantPath = `${accountPath}/grants/${f.memberId}`;
    const grant = await f.request(
      grantPath,
      "PUT",
      { level: "TOTALS" },
      f.actorToken,
      { "If-Match": '"0"' },
    );
    expect(grant.status).toBe(200);
    const sharedVersion = async () =>
      accountSchema.parse(
        await (
          await f.request(accountPath, "GET", undefined, f.memberToken)
        ).json(),
      ).version;
    let version = await sharedVersion();
    const csv =
      "date,description,amount\n2026-01-01,Already in anchor,50.00\n2026-01-02,After anchor,-12.34\n2026-01-03,Deposit,5.00\n" +
      Array.from(
        { length: 498 },
        (_, index) => `2026-01-02,Zero ${index},0\n`,
      ).join("");
    let batch = await f.preview(csv);
    expect(await estimate()).toMatchObject({
      accountId: f.accountId,
      status: "AVAILABLE",
      money: { amountMinor: "10000" },
      anchorDate: "2026-01-01",
      throughDate: "2026-01-01",
    });
    const publish = async (verifyPartial = false) => {
      const response = await f.request(
        `${f.root}/imports/${batch.id}/commit`,
        "POST",
        { acceptRejectedRows: false },
        f.actorToken,
        { "If-Match": `"${batch.version}"`, "Idempotency-Key": randomUUID() },
      );
      expect(response.status).toBe(202);
      if (verifyPartial) {
        expect(await f.progressStep(batch.id)).toBe(true);
        expect((await f.batch(batch.id)).state).toBe("COMMITTING");
        expect(await estimate()).toMatchObject({
          accountId: f.accountId,
          status: "AVAILABLE",
          money: { amountMinor: "10000" },
          throughDate: "2026-01-01",
        });
        expect(await sharedVersion()).toBe(version);
      }
      await f.progress(batch.id);
      batch = await f.batch(batch.id);
    };
    await publish(true);
    expect(await estimate()).toMatchObject({
      status: "AVAILABLE",
      money: { amountMinor: "9266", currency: "GBP" },
      anchorDate: "2026-01-01",
      throughDate: "2026-01-03",
    });
    expect(await estimate(f.memberToken)).toMatchObject({
      status: "AVAILABLE",
      money: { amountMinor: "9266" },
    });
    expect(await sharedVersion()).toBeGreaterThan(version);
    version = await sharedVersion();
    const retryResponse = await f.request(
      `${f.root}/imports/preview`,
      "POST",
      csv,
      f.actorToken,
      f.uploadHeaders(),
    );
    expect(retryResponse.status).toBe(202);
    const retry = importJobResultSchema.parse(await retryResponse.json());
    expect(retry.batch.id).toBe(batch.id);
    expect(await estimate()).toMatchObject({ money: { amountMinor: "9266" } });
    const rolled = await f.request(
      `${f.root}/imports/${batch.id}`,
      "DELETE",
      undefined,
      f.actorToken,
      { "If-Match": `"${batch.version}"` },
    );
    expect(rolled.status).toBe(200);
    batch = await f.batch(batch.id);
    expect(await estimate()).toMatchObject({
      accountId: f.accountId,
      status: "AVAILABLE",
      money: { amountMinor: "10000" },
      anchorDate: "2026-01-01",
      throughDate: "2026-01-01",
    });
    expect(await sharedVersion()).toBeGreaterThan(version);
    version = await sharedVersion();
    await publish();
    expect(await estimate()).toMatchObject({ money: { amountMinor: "9266" } });
    expect(await sharedVersion()).toBeGreaterThan(version);
    account = accountSchema.parse(await (await f.request(accountPath)).json());
    expect(account.latestValuation?.id).toBe(future.id);
    const newer = await f.request(
      `${accountPath}/valuations`,
      "POST",
      {
        money: { amountMinor: "3000", currency: "GBP" },
        asOfDate: "2026-01-03",
        adultMoney: null,
      },
      f.actorToken,
      { "If-Match": `"${account.version}"`, "Idempotency-Key": randomUUID() },
    );
    expect(newer.status).toBe(200);
    expect(await estimate()).toMatchObject({
      accountId: f.accountId,
      status: "AVAILABLE",
      money: { amountMinor: "3000" },
      anchorDate: "2026-01-03",
      throughDate: "2026-01-03",
    });
    const revoked = await f.request(
      grantPath,
      "PUT",
      { level: "NONE" },
      f.actorToken,
      { "If-Match": '"1"' },
    );
    expect(revoked.status).toBe(200);
    const unauthorized = await f.request(
      balancePath,
      "GET",
      undefined,
      f.memberToken,
    );
    expect(unauthorized.status).toBe(404);
  } finally {
    await f.close();
  }
}, 60000);

it("includes manual ledger rows and corrections when overlapping CSV is skipped", async () => {
  const f = await createImportsHttpFixture();
  const accountPath = `${f.root}/accounts/${f.accountId}`;
  const balancePath = `${f.root}/accounts/current-balances?accountIds=${f.accountId}`;
  const estimate = async () =>
    csvBalanceListSchema.parse(await (await f.request(balancePath)).json())
      .items[0];
  try {
    const account = accountSchema.parse(
      await (await f.request(accountPath)).json(),
    );
    expect(
      (
        await f.request(
          `${accountPath}/valuations`,
          "POST",
          {
            money: { amountMinor: "10000", currency: "GBP" },
            asOfDate: "2026-01-01",
            adultMoney: null,
          },
          f.actorToken,
          {
            "If-Match": `"${account.version}"`,
            "Idempotency-Key": randomUUID(),
          },
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await f.request(
          `${accountPath}/grants/${f.memberId}`,
          "PUT",
          { level: "TOTALS" },
          f.actorToken,
          { "If-Match": '"0"' },
        )
      ).status,
    ).toBe(200);
    const sharedVersion = async () =>
      accountSchema.parse(
        await (
          await f.request(accountPath, "GET", undefined, f.memberToken)
        ).json(),
      ).version;
    let version = await sharedVersion();
    const body = {
      accountId: f.accountId,
      bookedDate: "2026-01-02",
      description: "Manual shop",
      money: { amountMinor: "-1200", currency: "GBP" },
    };
    const created = await f.request(
      `${f.root}/transactions`,
      "POST",
      body,
      f.actorToken,
      { "Idempotency-Key": randomUUID() },
    );
    expect(created.status).toBe(200);
    const transaction = transactionSchema.parse(await created.json());
    expect(await sharedVersion()).toBeGreaterThan(version);
    version = await sharedVersion();
    expect(await estimate()).toMatchObject({
      status: "AVAILABLE",
      basis: "MANUAL_PLUS_LEDGER",
      money: { amountMinor: "8800" },
    });
    let batch = await f.preview(
      "date,description,amount\n2026-01-02,Manual shop,-12.00\n",
    );
    expect(batch.overlapRows).toBe(1);
    const review = await f.request(
      `${f.root}/imports/${batch.id}/review`,
      "PATCH",
      { decisions: [{ rowNumber: 1, decision: "SKIP" }] },
      f.actorToken,
      { "If-Match": `"${batch.version}"` },
    );
    expect(review.status).toBe(200);
    batch = await f.batch(batch.id);
    expect(
      (
        await f.request(
          `${f.root}/imports/${batch.id}/commit`,
          "POST",
          { acceptRejectedRows: false },
          f.actorToken,
          { "If-Match": `"${batch.version}"`, "Idempotency-Key": randomUUID() },
        )
      ).status,
    ).toBe(202);
    await f.progress(batch.id);
    expect(await estimate()).toMatchObject({ money: { amountMinor: "8800" } });
    expect(await sharedVersion()).toBe(version);
    expect(
      (
        await f.request(
          `${f.root}/transactions/${transaction.id}`,
          "PATCH",
          {
            bookedDate: "2026-01-03",
            description: "Corrected shop",
            money: { amountMinor: "-1500", currency: "GBP" },
          },
          f.actorToken,
          { "If-Match": `"${transaction.version}"` },
        )
      ).status,
    ).toBe(200);
    expect(await sharedVersion()).toBeGreaterThan(version);
    expect(await estimate()).toMatchObject({
      money: { amountMinor: "8500" },
      throughDate: "2026-01-03",
    });
    const current = accountSchema.parse(
      await (await f.request(accountPath)).json(),
    );
    expect(
      (
        await f.request(
          `${accountPath}/valuations`,
          "POST",
          {
            money: { amountMinor: "9223372036854775807", currency: "GBP" },
            asOfDate: "2026-01-03",
            adultMoney: null,
          },
          f.actorToken,
          {
            "If-Match": `"${current.version}"`,
            "Idempotency-Key": randomUUID(),
          },
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await f.request(
          `${f.root}/transactions`,
          "POST",
          {
            accountId: f.accountId,
            bookedDate: "2026-01-04",
            description: "Overflow test",
            money: { amountMinor: "1", currency: "GBP" },
          },
          f.actorToken,
          { "Idempotency-Key": randomUUID() },
        )
      ).status,
    ).toBe(200);
    expect(await estimate()).toEqual({
      accountId: f.accountId,
      status: "OUT_OF_RANGE",
    });
  } finally {
    await f.close();
  }
}, 60000);
