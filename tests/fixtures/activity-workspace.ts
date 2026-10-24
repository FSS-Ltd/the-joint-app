import type { Page } from "@playwright/test";
import type { TransactionResponse } from "../../packages/contracts/dist/index.js";
import {
  accounts,
  accountWorkspaceFixture,
  householdId,
} from "./account-workspace.js";

const firstAccount = accounts[0];
if (!firstAccount) throw Error("Missing synthetic activity account");
export const activityAccount = firstAccount;
export const transactions: TransactionResponse[] = [
  {
    id: "66666666-6666-4666-8666-000000000001",
    accountId: activityAccount.id,
    bookedDate: "2026-10-22",
    money: { amountMinor: "-1200", currency: "GBP" },
    description: "Cafe sample",
    source: "CSV",
    version: 1,
    createdAt: "2026-10-22T12:00:00.000Z",
    category: "Eating out",
    classificationKind: "EXPENSE",
    effectiveKind: "EXPENSE",
    classificationConfirmed: true,
    splits: [],
    transfer: null,
    merchant: "Sample cafe",
    note: { body: null, version: 0 },
    permissions: { canCorrect: false, canClassify: true, canNote: true },
  },
  {
    id: "66666666-6666-4666-8666-000000000002",
    accountId: activityAccount.id,
    bookedDate: "2026-10-21",
    money: { amountMinor: "10000", currency: "GBP" },
    description: "Household contribution sample",
    source: "MANUAL",
    version: 1,
    createdAt: "2026-10-21T12:00:00.000Z",
    category: null,
    classificationKind: null,
    effectiveKind: "INCOME",
    classificationConfirmed: false,
    splits: [],
    transfer: null,
    merchant: null,
    note: { body: null, version: 0 },
    permissions: { canCorrect: true, canClassify: true, canNote: true },
  },
];
const initialTransaction = transactions[0];
if (!initialTransaction) throw Error("Missing synthetic activity record");
export const firstTransaction = initialTransaction;
export async function activityWorkspaceFixture(page: Page): Promise<{
  reads: () => number;
  queries: URL[];
  fail: (value: boolean) => void;
  empty: (value: boolean) => void;
}> {
  await accountWorkspaceFixture(page);
  let failure = false,
    noItems = false,
    reads = 0;
  const queries: URL[] = [];
  await page.route(
    `**/api/households/${householdId}/transactions**`,
    (route) => {
      const url = new URL(route.request().url());
      reads++;
      queries.push(url);
      if (failure)
        return route.fulfill({
          status: 503,
          json: {
            error: { code: "UNAVAILABLE", message: "Activity unavailable." },
          },
        });
      if (url.pathname.endsWith("/transactions"))
        return route.fulfill({
          json: {
            items: noItems
              ? []
              : url.searchParams.has("cursor")
                ? [transactions[1]]
                : [firstTransaction],
            nextCursor:
              noItems || url.searchParams.has("cursor")
                ? null
                : "synthetic-next",
          },
        });
      const transaction = transactions.find((item) =>
        url.pathname.endsWith(`/${item.id}`),
      );
      return route.fulfill({
        status: transaction ? 200 : 404,
        json: transaction,
      });
    },
  );
  return {
    reads: () => reads,
    queries,
    fail: (value) => {
      failure = value;
    },
    empty: (value) => {
      noItems = value;
    },
  };
}
