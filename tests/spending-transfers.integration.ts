import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, expect, it } from "vitest";
import {
  accountSchema,
  spendingReportSchema,
  transactionSchema,
  transferResultSchema,
  type TransactionResponse,
} from "../packages/contracts/dist/index.js";
import {
  createImportsHttpFixture,
  type ImportsHttpFixture,
} from "./fixtures/imports-http.js";

let fixture: ImportsHttpFixture;
let from: TransactionResponse;
let to: TransactionResponse;
let transferId: string;
let original: {
  fromTransactionId: string;
  toTransactionId: string;
  fromVersion: number;
  toVersion: number;
};
const key = randomUUID();
async function create(
  accountId: string,
  amountMinor: string,
): Promise<TransactionResponse> {
  const response = await fixture.request(
    `${fixture.root}/transactions`,
    "POST",
    {
      accountId,
      money: { amountMinor, currency: "GBP" },
      bookedDate: "2026-01-15",
      description: "Synthetic family transaction",
    },
    fixture.actorToken,
    { "Idempotency-Key": randomUUID() },
  );
  expect(response.status).toBe(200);
  return transactionSchema.parse(await response.json());
}
async function read(
  id: string,
  token = fixture.actorToken,
): Promise<TransactionResponse> {
  const response = await fixture.request(
    `${fixture.root}/transactions/${id}`,
    "GET",
    undefined,
    token,
  );
  expect(response.status).toBe(200);
  return transactionSchema.parse(await response.json());
}
function input(a = from, b = to) {
  return {
    fromTransactionId: a.id,
    toTransactionId: b.id,
    fromVersion: a.version,
    toVersion: b.version,
  };
}
async function confirm(
  body = input(),
  token = fixture.actorToken,
  idempotencyKey = randomUUID(),
) {
  return fixture.request(
    `${fixture.root}/transfers/confirm`,
    "POST",
    body,
    token,
    { "Idempotency-Key": idempotencyKey },
  );
}
beforeAll(async () => {
  fixture = await createImportsHttpFixture();
  for (const [accountId, amountMinor, kind] of [
    [fixture.accountId, "-50000", "EXPENSE"],
    [fixture.manualAccountId, "50000", "INCOME"],
  ] as const) {
    let transaction = await create(accountId, amountMinor);
    const annotated = await fixture.request(
      `${fixture.root}/transactions/${transaction.id}/annotation`,
      "PATCH",
      { classificationKind: kind },
      fixture.actorToken,
      { "If-Match": `"${transaction.version}"` },
    );
    expect(annotated.ok).toBe(true);
    transaction = transactionSchema.parse(await annotated.json());
    if (amountMinor.startsWith("-")) from = transaction;
    else to = transaction;
  }
  original = input();
});
afterAll(async () => {
  await fixture?.close();
});
it("confirms exactly opposite owned legs without changing source figures", async () => {
  const response = await confirm(original, fixture.actorToken, key);
  expect(response.status).toBe(200);
  const result = transferResultSchema.parse(await response.json());
  transferId = result.id;
  expect(result.from.money).toEqual(from.money);
  expect(result.to.money).toEqual(to.money);
  expect(result.from.classificationKind).toBe("TRANSFER");
  expect(result.to.classificationKind).toBe("TRANSFER");
  from = result.from;
  to = result.to;
});
it("replays a confirmation without a second pair and rejects changed details for the same key", async () => {
  const replay = await confirm(original, fixture.actorToken, key);
  expect(replay.status).toBe(200);
  expect(transferResultSchema.parse(await replay.json()).id).toBe(transferId);
  expect(
    await fixture.maintenance.transferLink.count({
      where: { fromTransactionId: from.id },
    }),
  ).toBe(1);
  expect(
    (
      await confirm(
        { ...original, fromVersion: original.fromVersion + 1 },
        fixture.actorToken,
        key,
      )
    ).status,
  ).toBe(409);
  expect((await confirm()).status).toBe(409);
});
it("counts an owned transfer as zero consumption and retains a credit-card purchase after settlement", async () => {
  const initial = await fixture.request(
    `${fixture.root}/reports/spending?month=2026-01`,
  );
  expect(initial.status).toBe(200);
  expect(
    spendingReportSchema.parse(await initial.json()).summary?.spending
      .amountMinor,
  ).toBe("0");
  const created = await fixture.request(
    `${fixture.root}/accounts`,
    "POST",
    {
      label: "Synthetic card",
      kind: "CREDIT_CARD",
      currency: "GBP",
      liquidity: "AVAILABLE",
    },
    fixture.actorToken,
    { "Idempotency-Key": randomUUID() },
  );
  expect(created.status).toBe(200);
  const card = accountSchema.parse(await created.json());
  await create(card.id, "-12000");
  const bankPayment = await create(fixture.accountId, "-50000");
  const cardReceipt = await create(card.id, "50000");
  const settlement = await confirm(input(bankPayment, cardReceipt));
  expect(settlement.status).toBe(200);
  const report = await fixture.request(
    `${fixture.root}/reports/spending?month=2026-01`,
  );
  expect(report.status).toBe(200);
  const summary = spendingReportSchema.parse(await report.json()).summary;
  expect(summary?.spending.amountMinor).toBe("12000");
  expect(summary?.transferIn.amountMinor).toBe("100000");
  expect(summary?.transferOut.amountMinor).toBe("100000");
  expect(summary?.netCash.amountMinor).toBe("-12000");
});
it("shows a shared viewer only its paired leg and denies counterpart reads or writes even to household admins", async () => {
  for (const accountId of [fixture.accountId, fixture.manualAccountId]) {
    const shared = await fixture.request(
      `${fixture.root}/accounts/${accountId}/grants/${fixture.memberId}`,
      "PUT",
      { level: "TRANSACTIONS" },
      fixture.actorToken,
      { "If-Match": '"0"' },
    );
    expect(shared.status).toBe(200);
  }
  const viewed = await read(from.id, fixture.memberToken);
  expect(viewed.transfer).toEqual({
    confirmed: true,
    id: null,
    canRemove: false,
  });
  expect(viewed.permissions.canCorrect).toBe(false);
  expect(
    (
      await fixture.request(
        `${fixture.root}/transfers/${transferId}`,
        "GET",
        undefined,
        fixture.memberToken,
      )
    ).status,
  ).toBe(404);
  expect((await confirm(input(), fixture.memberToken)).status).toBe(404);
  expect(
    (
      await fixture.request(
        `${fixture.root}/transfers/${transferId}`,
        "DELETE",
        { fromVersion: from.version, toVersion: to.version },
        fixture.memberToken,
      )
    ).status,
  ).toBe(404);
  const narrowed = await fixture.request(
    `${fixture.root}/accounts/${fixture.manualAccountId}/grants/${fixture.memberId}`,
    "PUT",
    { level: "TOTALS" },
    fixture.actorToken,
    { "If-Match": '"1"' },
  );
  expect(narrowed.status).toBe(200);
  expect(
    (
      await fixture.request(
        `${fixture.root}/transactions/${to.id}`,
        "GET",
        undefined,
        fixture.memberToken,
      )
    ).status,
  ).toBe(404);
  expect((await read(from.id, fixture.memberToken)).transfer).toEqual({
    confirmed: true,
    id: null,
    canRemove: false,
  });
  expect(
    (
      await fixture.request(
        `/households/${fixture.otherHouseholdId}/transfers/${transferId}`,
        "GET",
        undefined,
        fixture.outsiderToken,
      )
    ).status,
  ).toBe(404);
});
it("allows merchant and author-private notes while blocking paired financial changes, categories and splits", async () => {
  const response = await fixture.request(
    `${fixture.root}/transactions/${from.id}/annotation`,
    "PATCH",
    {
      merchant: "Synthetic merchant",
      note: "Synthetic owner note",
      noteVersion: 0,
    },
    fixture.actorToken,
    { "If-Match": `"${from.version}"` },
  );
  expect(response.status).toBe(200);
  from = transactionSchema.parse(await response.json());
  const member = await fixture.request(
    `${fixture.root}/transactions/${from.id}/annotation`,
    "PATCH",
    { note: "Synthetic member note", noteVersion: 0 },
    fixture.memberToken,
    { "If-Match": `"${from.version}"` },
  );
  expect(member.status).toBe(200);
  expect(transactionSchema.parse(await member.json()).note.body).toBe(
    "Synthetic member note",
  );
  expect((await read(from.id)).note.body).toBe("Synthetic owner note");
  const replay = await confirm(original, fixture.actorToken, key);
  expect(replay.status).toBe(200);
  expect(transferResultSchema.parse(await replay.json()).from.merchant).toBe(
    "Synthetic merchant",
  );

  for (const body of [
    { category: "Unwanted change" },
    { classificationKind: "EXPENSE" },
  ]) {
    expect(
      (
        await fixture.request(
          `${fixture.root}/transactions/${from.id}/annotation`,
          "PATCH",
          body,
          fixture.actorToken,
          { "If-Match": `"${from.version}"` },
        )
      ).status,
    ).toBe(409);
  }
  expect(
    (
      await fixture.request(
        `${fixture.root}/transactions/${from.id}`,
        "PATCH",
        {
          money: from.money,
          bookedDate: from.bookedDate,
          description: "Changed financial source",
        },
        fixture.actorToken,
        { "If-Match": `"${from.version}"` },
      )
    ).status,
  ).toBe(409);
  expect(
    (
      await fixture.request(
        `${fixture.root}/transactions/${from.id}/splits`,
        "PUT",
        { lines: [] },
        fixture.actorToken,
        { "If-Match": `"${from.version}"` },
      )
    ).status,
  ).toBe(409);
});
it("requires both current versions for removal and restores prior kinds without losing merchant or private notes", async () => {
  const stale = await fixture.request(
    `${fixture.root}/transfers/${transferId}`,
    "DELETE",
    { fromVersion: from.version - 1, toVersion: to.version },
  );
  expect(stale.status).toBe(409);
  const response = await fixture.request(
    `${fixture.root}/transfers/${transferId}`,
    "DELETE",
    { fromVersion: from.version, toVersion: to.version },
  );
  expect(response.status).toBe(200);
  const result = transferResultSchema.parse(await response.json());
  expect(result.from.classificationKind).toBe("EXPENSE");
  expect(result.to.classificationKind).toBe("INCOME");
  expect(result.from.transfer).toBeNull();
  expect(result.from.merchant).toBe("Synthetic merchant");
  expect(result.from.note.body).toBe("Synthetic owner note");
  expect((await read(from.id, fixture.memberToken)).note.body).toBe(
    "Synthetic member note",
  );
  from = result.from;
  to = result.to;
  const revisions = await fixture.maintenance.transactionRevision.findMany({
    where: {
      transactionId: from.id,
      kind: { in: ["TRANSFER_CONFIRM", "TRANSFER_REMOVE"] },
    },
    select: { data: true },
  });
  expect(revisions).toHaveLength(2);
  expect(JSON.stringify(revisions)).not.toContain(to.id);
  expect(JSON.stringify(revisions)).not.toContain(to.accountId);
  expect(
    (await fixture.request(`${fixture.root}/transfers/${transferId}`, "GET"))
      .status,
  ).toBe(404);
  expect((await confirm(original, fixture.actorToken, key)).status).toBe(404);
});
it("rejects unequal amounts and same-account pairs before any mutation", async () => {
  const unequal = await create(fixture.manualAccountId, "40000");
  expect((await confirm(input(from, unequal))).status).toBe(400);
  const sameAccount = await create(fixture.accountId, "50000");
  expect((await confirm(input(from, sameAccount))).status).toBe(400);
  expect((await confirm(input(to, from))).status).toBe(400);
  expect((await read(from.id)).version).toBe(from.version);
});
it("rejects split legs and serialises concurrent confirmations on one source", async () => {
  const split = await fixture.request(
    `${fixture.root}/transactions/${from.id}/splits`,
    "PUT",
    {
      lines: [
        {
          category: "Food",
          money: { amountMinor: "-30000", currency: "GBP" },
          classificationKind: "EXPENSE",
        },
        {
          category: "Travel",
          money: { amountMinor: "-20000", currency: "GBP" },
          classificationKind: "EXPENSE",
        },
      ],
    },
    fixture.actorToken,
    { "If-Match": `"${from.version}"` },
  );
  expect(split.status).toBe(200);
  from = transactionSchema.parse(await split.json());
  expect((await confirm()).status).toBe(409);
  const clear = await fixture.request(
    `${fixture.root}/transactions/${from.id}/splits`,
    "PUT",
    { lines: [] },
    fixture.actorToken,
    { "If-Match": `"${from.version}"` },
  );
  expect(clear.status).toBe(200);
  from = transactionSchema.parse(await clear.json());
  const alternative = await create(fixture.manualAccountId, "50000");
  const responses = await Promise.all([
    confirm(input()),
    confirm(input(from, alternative)),
  ]);
  expect(responses.map((response) => response.status).sort()).toEqual([
    200, 409,
  ]);
  expect(
    await fixture.maintenance.transferLink.count({
      where: { fromTransactionId: from.id, active: true },
    }),
  ).toBe(1);
});

it("hides an active pair and refuses its current replay after ownership is revoked", async () => {
  const currentFrom = await read(from.id);
  const link = await fixture.maintenance.transferLink.findFirstOrThrow({
    where: { fromTransactionId: from.id, active: true },
  });
  const currentTo = await read(link.toTransactionId);
  const replayInput = input(currentFrom, currentTo);
  const freshFrom = await create(fixture.accountId, "-77700");
  const freshTo = await create(fixture.manualAccountId, "77700");
  const freshInput = input(freshFrom, freshTo);
  const replayKey = randomUUID();
  const response = await confirm(freshInput, fixture.actorToken, replayKey);
  expect(response.status).toBe(200);
  const pair = transferResultSchema.parse(await response.json());
  const owner = await fixture.maintenance.accountOwner.findFirstOrThrow({
    where: { accountId: fixture.accountId, status: "ACTIVE" },
  });
  await fixture.maintenance.accountOwner.update({
    where: {
      accountId_userId: { accountId: owner.accountId, userId: owner.userId },
    },
    data: { status: "ARCHIVED" },
  });
  expect(
    (await fixture.request(`${fixture.root}/transfers/${pair.id}`, "GET"))
      .status,
  ).toBe(404);
  expect(
    (await confirm(freshInput, fixture.actorToken, replayKey)).status,
  ).toBe(404);
  expect(
    (
      await fixture.request(`${fixture.root}/transfers/${link.id}`, "DELETE", {
        fromVersion: replayInput.fromVersion,
        toVersion: replayInput.toVersion,
      })
    ).status,
  ).toBe(404);
  await fixture.maintenance.accountOwner.update({
    where: {
      accountId_userId: { accountId: owner.accountId, userId: owner.userId },
    },
    data: { status: "ACTIVE" },
  });
});
