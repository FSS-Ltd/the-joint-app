import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  accountSchema,
  authServerEnvironmentSchema,
  budgetSchema,
  spendingReportSchema,
  transactionSchema,
  transactionListSchema,
  type TransactionResponse,
} from "../packages/contracts/dist/index.js";
import {
  createImportsHttpFixture,
  type ImportsHttpFixture,
} from "./fixtures/imports-http.js";

import { IdentityVault } from "../apps/api/dist/modules/identity/identity-vault.js";

describe("monthly spending HTTP boundary", () => {
  let fixture: ImportsHttpFixture;
  beforeAll(async () => {
    fixture = await createImportsHttpFixture();
  }, 30000);
  afterAll(async () => {
    await fixture?.close();
  });
  async function create(amountMinor: string, bookedDate = "2026-01-15") {
    const response = await fixture.request(
      `${fixture.root}/transactions`,
      "POST",
      {
        accountId: fixture.accountId,
        bookedDate,
        money: { amountMinor, currency: "GBP" },
        description: "Synthetic monthly record",
      },
      undefined,
      { "Idempotency-Key": randomUUID() },
    );
    expect(response.status).toBe(200);
    return transactionSchema.parse(await response.json());
  }
  async function annotate(row: TransactionResponse, body: unknown) {
    const response = await fixture.request(
      `${fixture.root}/transactions/${row.id}/annotation`,
      "PATCH",
      body,
      undefined,
      { "If-Match": `"${row.version}"` },
    );
    expect(response.status).toBe(200);
    return transactionSchema.parse(await response.json());
  }
  async function report(month = "2026-01", token = fixture.actorToken) {
    const response = await fixture.request(
      `${fixture.root}/reports/spending?month=${month}&accountIds=${fixture.accountId}`,
      "GET",
      undefined,
      token,
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    return spendingReportSchema.parse(await response.json());
  }
  it("returns an explicitly incomplete empty selected month", async () => {
    const value = await report();
    expect(value.coverage.complete).toBe(false);
    expect(value.scope.map((account) => account.id)).toEqual([
      fixture.accountId,
    ]);
  });
  it("replaces the parent with exact splits, preserves booked-month refunds and rejects stale or invalid edits", async () => {
    const purchase = await create("-12000");
    await annotate(purchase, {
      category: "Food",
      classificationKind: "EXPENSE",
    });
    let split = await create("-10000");
    const splitPath = `${fixture.root}/transactions/${split.id}/splits`;
    const invalid = await fixture.request(
      splitPath,
      "PUT",
      {
        lines: [
          {
            category: "Food",
            classificationKind: "EXPENSE",
            money: { amountMinor: "-6000", currency: "GBP" },
          },
          {
            category: "Utilities",
            classificationKind: "EXPENSE",
            money: { amountMinor: "-3000", currency: "GBP" },
          },
        ],
      },
      undefined,
      { "If-Match": `"${split.version}"` },
    );
    expect(invalid.status).toBe(400);
    expect(await invalid.json()).toMatchObject({
      error: { code: "INVALID_SPLITS" },
    });
    const response = await fixture.request(
      splitPath,
      "PUT",
      {
        lines: [
          {
            category: "Food",
            classificationKind: "EXPENSE",
            money: { amountMinor: "-6000", currency: "GBP" },
          },
          {
            category: "Utilities",
            classificationKind: "EXPENSE",
            money: { amountMinor: "-4000", currency: "GBP" },
          },
        ],
      },
      undefined,
      { "If-Match": `"${split.version}"` },
    );
    expect(response.status).toBe(200);
    split = transactionSchema.parse(await response.json());
    expect(split.splits).toHaveLength(2);
    expect(split.effectiveKind).toBeNull();
    expect(split.permissions.canCorrect).toBe(false);
    const blocked = await fixture.request(
      `${fixture.root}/transactions/${split.id}/annotation`,
      "PATCH",
      { category: "Other" },
      undefined,
      { "If-Match": `"${split.version}"` },
    );
    expect(blocked.status).toBe(409);
    expect(await blocked.json()).toMatchObject({
      error: { code: "CLASSIFICATION_LOCKED" },
    });
    await annotate(split, { merchant: "Synthetic shop" });
    const stale = await fixture.request(
      splitPath,
      "PUT",
      { lines: [] },
      undefined,
      { "If-Match": `"${split.version}"` },
    );
    expect(stale.status).toBe(409);
    await annotate(await create("-5000"), {
      category: "Household",
      classificationKind: "EXPENSE",
    });
    await annotate(await create("5000", "2026-02-03"), {
      category: "Household",
      classificationKind: "REFUND",
    });
    await annotate(await create("200000"), {
      category: "Salary",
      classificationKind: "INCOME",
    });
    const january = await report();
    expect(january.summary?.spending.amountMinor).toBe("27000");
    expect(january.summary?.income.amountMinor).toBe("200000");
    expect(january.summary?.netCash.amountMinor).toBe("173000");
    expect(january.provenance.sourceRowCount).toBe(4);
    expect(january.summary?.categories).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          category: "Food",
          spending: { amountMinor: "18000", currency: "GBP" },
        }),
        expect.objectContaining({
          category: "Utilities",
          spending: { amountMinor: "4000", currency: "GBP" },
        }),
      ]),
    );
    expect((await report("2026-02")).summary?.spending.amountMinor).toBe(
      "-5000",
    );
    expect((await report()).summary?.spending.amountMinor).toBe("27000");
    const filtered = await fixture.request(
      `${fixture.root}/transactions?accountId=${fixture.accountId}&month=2026-01&category=Food&classificationKind=EXPENSE&limit=1`,
    );
    expect(filtered.status).toBe(200);
    const page = transactionListSchema.parse(await filtered.json());
    expect(page.items).toHaveLength(1);
    expect(page.nextCursor).toBeTypeOf("string");
    const changed = await fixture.request(
      `${fixture.root}/transactions?accountId=${fixture.accountId}&month=2026-02&category=Food&classificationKind=EXPENSE&limit=1&cursor=${encodeURIComponent(page.nextCursor ?? "")}`,
    );
    expect(changed.status).toBe(400);
  });
  it("records closed-month coverage and plans shared budgets only for a fully visible exact scope", async () => {
    const coveragePath = `${fixture.root}/accounts/${fixture.accountId}/coverage/2026-01`;
    const coverage = await fixture.request(
      coveragePath,
      "PUT",
      { complete: true },
      undefined,
      { "If-Match": '"0"' },
    );
    expect(coverage.status).toBe(200);
    expect((await report()).coverage.complete).toBe(true);
    expect(
      (
        await fixture.request(
          `${fixture.root}/accounts/${fixture.accountId}/coverage/2099-01`,
          "PUT",
          { complete: true },
          undefined,
          { "If-Match": '"0"' },
        )
      ).status,
    ).toBe(400);
    const budgetPath = `${fixture.root}/budgets/2026-01`;
    const input = {
      accountIds: [fixture.accountId],
      lines: [
        { category: "Food", limit: { amountMinor: "20000", currency: "GBP" } },
        { category: null, limit: { amountMinor: "0", currency: "GBP" } },
      ],
    };
    const response = await fixture.request(
      budgetPath,
      "PUT",
      input,
      undefined,
      { "If-Match": '"0"' },
    );
    expect(response.status).toBe(200);
    const budget = budgetSchema.parse(await response.json());
    expect(budget.lines).toEqual(expect.arrayContaining(input.lines));
    expect((await report()).budget?.id).toBe(budget.id);
    expect(
      (
        await fixture.request(budgetPath, "PUT", input, undefined, {
          "If-Match": '"0"',
        })
      ).status,
    ).toBe(409);
    expect(
      (
        await fixture.request(
          `${budgetPath}?accountIds=${fixture.accountId}`,
          "GET",
          undefined,
          fixture.memberToken,
        )
      ).status,
    ).toBe(404);
    let account = accountSchema.parse(
      await (
        await fixture.request(`${fixture.root}/accounts/${fixture.accountId}`)
      ).json(),
    );
    let grantResponse = await fixture.request(
      `${fixture.root}/accounts/${fixture.accountId}/grants/${fixture.memberId}`,
      "PUT",
      { level: "TRANSACTIONS" },
      undefined,
      { "If-Match": `"${account.sharing?.version ?? 0}"` },
    );
    expect(grantResponse.status).toBe(200);
    account = accountSchema.parse(await grantResponse.json());
    expect((await report("2026-01", fixture.memberToken)).budget?.id).toBe(
      budget.id,
    );
    expect(
      (
        await fixture.request(
          coveragePath,
          "PUT",
          { complete: false },
          fixture.memberToken,
          { "If-Match": '"1"' },
        )
      ).status,
    ).toBe(404);
    const shared = await fixture.request(
      budgetPath,
      "PUT",
      input,
      fixture.memberToken,
      { "If-Match": `"${budget.version}"` },
    );
    expect(shared.status).toBe(200);
    grantResponse = await fixture.request(
      `${fixture.root}/accounts/${fixture.accountId}/grants/${fixture.memberId}`,
      "PUT",
      { level: "TOTALS" },
      undefined,
      { "If-Match": `"${account.sharing?.version ?? 0}"` },
    );
    expect(grantResponse.status).toBe(200);
    expect(
      (
        await fixture.request(
          `${budgetPath}?accountIds=${fixture.accountId}`,
          "GET",
          undefined,
          fixture.memberToken,
        )
      ).status,
    ).toBe(404);
    expect(
      (
        await fixture.request(budgetPath, "PUT", input, fixture.memberToken, {
          "If-Match": '"2"',
        })
      ).status,
    ).toBe(404);
  });
  it("applies category and kind to the same split component", async () => {
    const row = await create("-10000", "2026-03-01");
    const response = await fixture.request(
      `${fixture.root}/transactions/${row.id}/splits`,
      "PUT",
      {
        lines: [
          {
            category: "Food",
            classificationKind: "EXPENSE",
            money: { amountMinor: "-12000", currency: "GBP" },
          },
          {
            category: "Refunds",
            classificationKind: "REFUND",
            money: { amountMinor: "2000", currency: "GBP" },
          },
        ],
      },
      undefined,
      { "If-Match": `"${row.version}"` },
    );
    expect(response.status).toBe(200);
    const filtered = await fixture.request(
      `${fixture.root}/transactions?accountId=${fixture.accountId}&month=2026-03&category=Food&classificationKind=REFUND`,
    );
    expect(filtered.status).toBe(200);
    expect(transactionListSchema.parse(await filtered.json()).items).toEqual(
      [],
    );
  });
  it("replays a pre-reporting transaction response without requiring new stored DTO fields", async () => {
    const key = randomUUID();
    const input = {
      accountId: fixture.accountId,
      bookedDate: "2025-01-01",
      money: { amountMinor: "0", currency: "GBP" },
      description: "Synthetic historical replay",
    };
    const path = `${fixture.root}/transactions`;
    const response = await fixture.request(path, "POST", input, undefined, {
      "Idempotency-Key": key,
    });
    expect(response.status).toBe(200);
    const row = transactionSchema.parse(await response.json());
    const stored = await fixture.maintenance.requestKey.findFirstOrThrow({
      where: { key },
    });
    const env = authServerEnvironmentSchema.parse(process.env);
    const vault = new IdentityVault(
      env.AUTH_TOKEN_KEY,
      env.AUTH_EMAIL_HASH_KEY,
    );
    const addedFields = new Set([
      "classificationKind",
      "effectiveKind",
      "classificationConfirmed",
      "splits",
      "transfer",
    ]);
    const historical = Object.fromEntries(
      Object.entries(row).filter(([field]) => !addedFields.has(field)),
    );
    await fixture.maintenance.requestKey.update({
      where: {
        userId_route_key: { userId: stored.userId, route: stored.route, key },
      },
      data: {
        resultCiphertext: vault.seal(
          JSON.stringify(historical),
          `request:${stored.userId}:${stored.route}:${key}`,
        ),
      },
    });
    const replay = await fixture.request(path, "POST", input, undefined, {
      "Idempotency-Key": key,
    });
    expect(replay.status).toBe(200);
    expect(transactionSchema.parse(await replay.json()).id).toBe(row.id);
  });
});
