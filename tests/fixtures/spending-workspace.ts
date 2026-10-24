import type { Page } from "@playwright/test";
import {
  budgetUpsertSchema,
  type AggregateMoney,
  type SpendingReport,
} from "../../packages/contracts/dist/index.js";
import {
  accounts,
  accountWorkspaceFixture,
  householdId,
} from "./account-workspace.js";
const account = accounts[0];
if (!account) throw Error("Missing synthetic report account");
export const reportAccount = account;
const money = (amountMinor: string): AggregateMoney => ({
  amountMinor,
  currency: "GBP",
});
export const spendingReport: SpendingReport = {
  month: "2026-01",
  startDate: "2026-01-01",
  endDateExclusive: "2026-02-01",
  scopeKey: "a".repeat(64),
  permissionKey: "b".repeat(64),
  calculatedAt: "2026-01-23T12:00:00.000Z",
  scope: [
    {
      id: account.id,
      label: account.label,
      kind: account.kind,
      ownership: "OWNED",
      version: 1,
      coverage: { version: 1, complete: false, reviewedAt: null },
    },
  ],
  coverage: {
    complete: false,
    closedPeriod: true,
    reasons: ["MISSING_HISTORY"],
    missingAccountIds: [account.id],
  },
  summary: {
    spending: money("14000"),
    income: money("200000"),
    netCash: money("186000"),
    transferIn: money("0"),
    transferOut: money("0"),
    debtServiceOut: money("0"),
    debtSettlementIn: money("0"),
    principalIn: money("0"),
    principalOut: money("0"),
    contributionIn: money("0"),
    contributionOut: money("0"),
    unclassifiedIn: money("0"),
    unclassifiedOut: money("0"),
    categories: [
      {
        category: "Eating out",
        grouped: false,
        spending: money("5800"),
        count: 1,
      },
      {
        category: "Essentials",
        grouped: false,
        spending: money("3200"),
        count: 1,
      },
      {
        category: "Transport",
        grouped: false,
        spending: money("5000"),
        count: 1,
      },
    ],
    unreviewedCount: 0,
    unclassifiedCount: 0,
    unknownDebtCount: 0,
    consumptionComplete: true,
  },
  trend: [
    {
      month: "2025-12",
      spending: money("11000"),
      income: money("200000"),
      netCash: money("189000"),
      complete: false,
      closedPeriod: true,
    },
    {
      month: "2026-01",
      spending: money("14000"),
      income: money("200000"),
      netCash: money("186000"),
      complete: false,
      closedPeriod: true,
    },
  ],
  comparison: null,
  budget: {
    id: "88888888-8888-4888-8888-000000000001",
    scopeId: "88888888-8888-4888-8888-000000000002",
    month: "2026-01",
    accountIds: [account.id],
    currency: "GBP",
    version: 1,
    updatedAt: "2026-01-22T12:00:00.000Z",
    lines: ["Eating out", "Essentials", "Transport"].map((category) => ({
      category,
      limit: money("5000"),
    })),
  },
  provenance: {
    source: "CSV_MANUAL",
    latestRecordDate: "2026-01-22",
    sourceRowCount: 4,
  },
};
export async function spendingWorkspaceFixture(page: Page): Promise<{
  setReport: (value: SpendingReport) => void;
  fail: (value: boolean) => void;
  reads: () => number;
  queries: URL[];
  writes: { method: string; version: string | undefined; body: unknown }[];
}> {
  await accountWorkspaceFixture(page);
  let report = structuredClone(spendingReport),
    failure = false,
    reads = 0;
  const queries: URL[] = [],
    writes: { method: string; version: string | undefined; body: unknown }[] =
      [];
  await page.route("**/api/auth/csrf", (route) =>
    route.fulfill({ json: { csrfToken: "synthetic-csrf" } }),
  );
  await page.route(
    `**/api/households/${householdId}/reports/spending**`,
    (route) => {
      reads++;
      queries.push(new URL(route.request().url()));
      return failure
        ? route.fulfill({
            status: 503,
            json: {
              error: {
                code: "UNAVAILABLE",
                message: "Report temporarily unavailable.",
              },
            },
          })
        : route.fulfill({ json: report });
    },
  );
  await page.route(`**/api/households/${householdId}/budgets/**`, (route) => {
    const request = route.request(),
      body: unknown = request.postDataJSON();
    writes.push({
      method: request.method(),
      version: request.headers()["if-match"],
      body,
    });
    const parsed = budgetUpsertSchema.parse(body);
    if (!report.budget) throw Error("Missing synthetic budget");
    report = {
      ...report,
      budget: {
        ...report.budget,
        version: report.budget.version + 1,
        lines: parsed.lines,
      },
    };
    return route.fulfill({ json: report.budget });
  });
  return {
    setReport: (value) => {
      report = value;
    },
    fail: (value) => {
      failure = value;
    },
    reads: () => reads,
    queries,
    writes,
  };
}
