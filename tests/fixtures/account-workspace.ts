import type { Page } from "@playwright/test";
import type {
  AccountResponse,
  MeResponse,
} from "../../packages/contracts/dist/index.js";

export const householdId = "11111111-1111-4111-8111-111111111111";
const accountId = (index: number): string =>
  `22222222-2222-4222-8222-${String(index).padStart(12, "0")}`;
function account(index: number, label: string): AccountResponse {
  return {
    id: accountId(index),
    householdId,
    label,
    kind: "CURRENT",
    currency: "GBP",
    legalOwnerKind: "ADULT",
    liquidity: "AVAILABLE",
    version: 1,
    source: "MANUAL",
    ownership: "OWNED",
    access: "TRANSACTIONS",
    latestValuation: {
      id: `33333333-3333-4333-8333-${String(index).padStart(12, "0")}`,
      money: { amountMinor: "82000", currency: "GBP" },
      adultMoney: null,
      asOfDate: "2026-10-22",
      recordedAt: "2026-10-22T12:00:00.000Z",
      complete: true,
      source: "MANUAL",
    },
    sharing: { membershipId: null, level: "NONE", version: 0 },
    permissions: { canEdit: true, canValue: true, canShare: true },
  };
}
const shared = account(2, "Shared household saving");
export const accounts: AccountResponse[] = [
  account(1, "Everyday account"),
  {
    ...shared,
    kind: "SAVINGS",
    ownership: "SHARED",
    access: "TOTALS",
    sharing: null,
    latestValuation: shared.latestValuation && {
      ...shared.latestValuation,
      complete: false,
    },
    permissions: { canEdit: false, canValue: false, canShare: false },
  },
  { ...account(3, "Credit card"), kind: "CREDIT_CARD" },
  { ...account(4, "Future saving"), kind: "SAVINGS", latestValuation: null },
];
export const nextAccount = account(5, "Another visible account");
export const identity: MeResponse = {
  user: {
    id: "44444444-4444-4444-8444-444444444444",
    email: "workspace@example.test",
  },
  membership: {
    id: "55555555-5555-4555-8555-555555555555",
    householdId,
    role: "ADMIN",
    grantVersion: 1,
    household: {
      id: householdId,
      name: "Synthetic household",
      baseCurrency: "GBP",
      timezone: "Europe/London",
      memberCount: 2,
    },
  },
  session: {
    aal: "aal2",
    expiresAt: "2099-01-01T00:00:00.000Z",
    needsMfa: false,
    mfaVerifiedAt: "2026-10-24T00:00:00.000Z",
    purpose: "NORMAL",
  },
  factors: [],
};

export async function accountWorkspaceFixture(page: Page): Promise<{
  listReads: () => number;
  failList: (value: boolean) => void;
}> {
  let reads = 0,
    failure = false;
  await page.route("**/api/**", (route) =>
    route.fulfill({
      status: 503,
      json: { error: { code: "UNAVAILABLE", message: "Synthetic outage" } },
    }),
  );
  await page.route("**/api/me", (route) => route.fulfill({ json: identity }));
  await page.route(`**/api/households/${householdId}/accounts**`, (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === `/api/households/${householdId}/accounts`) {
      reads++;
      return failure
        ? route.fulfill({
            status: 503,
            json: {
              error: {
                code: "UNAVAILABLE",
                message: "Account list temporarily unavailable.",
              },
            },
          })
        : route.fulfill({
            json: url.searchParams.has("cursor")
              ? { items: [nextAccount], nextCursor: null }
              : { items: accounts, nextCursor: "synthetic-next" },
          });
    }
    const selected = [...accounts, nextAccount].find((item) =>
      url.pathname.endsWith(`/${item.id}`),
    );
    return selected
      ? route.fulfill({ json: selected })
      : route.fulfill({
          status: 404,
          json: {
            error: { code: "NOT_FOUND", message: "Account unavailable." },
          },
        });
  });
  return {
    listReads: () => reads,
    failList: (value) => {
      failure = value;
    },
  };
}
