import { installStatusSignals } from "./status-signals.js";
import type { Page } from "@playwright/test";
import type {
  AccountResponse,
  ExportStatus,
  TransactionResponse,
} from "../../packages/contracts/dist/index.js";
import {
  accounts,
  accountWorkspaceFixture,
  householdId,
} from "./account-workspace.js";
import { transactions } from "./activity-workspace.js";

export async function privacyWorkspaceFixture(page: Page): Promise<{
  failArchive: (value: boolean) => void;
  setAccounts: (value: AccountResponse[]) => void;
  setHistory: (value: TransactionResponse[]) => void;
  exportBodies: unknown[];
}> {
  await accountWorkspaceFixture(page);
  await installStatusSignals(page);
  let failure = false;
  let privacyRows = accounts;
  let rows = accounts.filter((account) => account.ownership === "OWNED");
  let history = transactions;
  const exportBodies: unknown[] = [];
  const job: ExportStatus = {
    id: "77777777-7777-4777-8777-777777777777",
    state: "READY",
    createdAt: "2026-10-24T00:00:00.000Z",
    expiresAt: "2099-01-01T00:00:00.000Z",
    downloadExpiresAt: "2099-01-01T00:00:00.000Z",
  };
  await page.route(`**/api/households/${householdId}/entitlements`, (route) =>
    route.fulfill({
      json: {
        plan: "FREE",
        version: "a".repeat(64),
        capabilities: ["finance.manual", "projections.basic"],
        caps: {
          bankAuthorisations: 0,
          brokerConnections: 0,
          companionDevices: 0,
        },
        effectiveUntil: null,
      },
    }),
  );
  await page.route(`**/api/households/${householdId}/accounts?*`, (route) =>
    privacyRows === accounts
      ? route.fallback()
      : route.fulfill({ json: { items: privacyRows, nextCursor: null } }),
  );
  await page.route("**/api/me/archive/accounts**", (route) => {
    const url = new URL(route.request().url());
    if (failure)
      return route.fulfill({
        status: 503,
        json: {
          error: { code: "UNAVAILABLE", message: "Archive unavailable." },
        },
      });
    if (url.pathname.endsWith("/transactions"))
      return route.fulfill({
        json: {
          items: url.searchParams.has("cursor")
            ? history.slice(1)
            : history.slice(0, 1),
          nextCursor: url.searchParams.has("cursor") ? null : "history-next",
        },
      });
    return route.fulfill({ json: { items: rows, nextCursor: null } });
  });
  await page.route("**/api/auth/csrf", (route) =>
    route.fulfill({ json: { csrfToken: "synthetic-csrf" } }),
  );
  for (const path of [
    `/api/households/${householdId}/exports`,
    "/api/me/archive/exports",
  ]) {
    await page.route(`**${path}**`, (route) => {
      if (route.request().method() === "POST")
        exportBodies.push(route.request().postDataJSON());
      return route.fulfill({ json: job });
    });
  }
  return {
    failArchive: (value) => {
      failure = value;
    },
    setAccounts: (value) => {
      rows = value;
      privacyRows = value;
    },
    setHistory: (value) => {
      history = value;
    },
    exportBodies,
  };
}
