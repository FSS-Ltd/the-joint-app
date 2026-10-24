import { expect, test } from "@playwright/test";
import {
  reportAccount,
  spendingReport,
  spendingWorkspaceFixture,
} from "../fixtures/spending-workspace.js";
test.use({ serviceWorkers: "block" });
const query = `month=2026-01&accountIds=${reportAccount.id}`;

test("failed report refresh clears previous amounts and explicit retry recovers", async ({
  page,
}) => {
  const fixture = await spendingWorkspaceFixture(page);
  await page.goto(`/dashboard?${query}`);
  await expect(
    page.getByRole("heading", { name: "£140.00", exact: true }),
  ).toBeVisible();
  fixture.fail(true);
  await page
    .getByRole("button", { name: "Refresh report", exact: true })
    .click();
  await expect(
    page
      .getByRole("alert")
      .filter({ hasText: "This report could not be refreshed." }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "£140.00", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("region", { name: "Category caps", exact: true }),
  ).toHaveCount(0);
  fixture.fail(false);
  await page
    .getByRole("button", { name: "Refresh report", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "£140.00", exact: true }),
  ).toBeVisible();
});

test("missing summary never calculates remaining with or without saved caps", async ({
  page,
}) => {
  const fixture = await spendingWorkspaceFixture(page);
  for (const budget of [null, spendingReport.budget]) {
    fixture.setReport({ ...spendingReport, summary: null, budget });
    await page.goto(`/budgets?${query}`);
    await expect(
      page.getByRole("heading", {
        name: "Plan a comfortable month",
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("region", { name: "Category caps", exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("table", {
        name: "Budget and refund-adjusted actuals · 2026-01",
        exact: true,
      }),
    ).toHaveCount(0);
    await expect(page.getByText(/£.*(?:left|over limit)/)).toHaveCount(0);
    await expect(
      page.getByText(
        "Review counts are unavailable. Refresh the report to try again.",
        { exact: true },
      ),
    ).toBeVisible();
    await expect(
      page.getByText("0 unreviewed components · 0 unclassified components", {
        exact: true,
      }),
    ).toHaveCount(0);
  }
});

test("refunds and a zero cap retain signed actuals and bounded rulers", async ({
  page,
}) => {
  const fixture = await spendingWorkspaceFixture(page);
  const { summary, budget } = spendingReport;
  if (!summary || !budget) throw Error("Missing synthetic budget");
  fixture.setReport({
    ...spendingReport,
    summary: {
      ...summary,
      spending: { amountMinor: "7400", currency: "GBP" },
      netCash: { amountMinor: "192600", currency: "GBP" },
      categories: summary.categories.map((category) =>
        category.category === "Eating out"
          ? { ...category, spending: { amountMinor: "-800", currency: "GBP" } }
          : category,
      ),
    },
    budget: {
      ...budget,
      lines: budget.lines.map((line) =>
        line.category === "Transport"
          ? { ...line, limit: { amountMinor: "0", currency: "GBP" } }
          : line,
      ),
    },
  });
  await page.goto(`/budgets?${query}`);
  const caps = page.getByRole("region", { name: "Category caps", exact: true });
  await expect(caps.getByText("£58.00 left", { exact: true })).toBeVisible();
  await expect(caps.getByText(/Net refunds increase/)).toBeVisible();
  await expect(
    caps.getByText("£50.00 over limit", { exact: true }),
  ).toBeVisible();
  await expect(
    caps.getByRole("meter", { name: "Eating out cap used", exact: true }),
  ).toHaveAttribute("aria-valuenow", "0");
  await expect(
    caps.getByRole("meter", { name: "Transport cap used", exact: true }),
  ).toHaveAttribute("aria-valuenow", "100");
});

test("shared report accounts do not receive owner-only history controls", async ({
  page,
}) => {
  const fixture = await spendingWorkspaceFixture(page);
  fixture.setReport({
    ...spendingReport,
    scope: spendingReport.scope.map((account) => ({
      ...account,
      ownership: "SHARED",
    })),
  });
  await page.goto(`/review?${query}`);
  const coverage = page.getByRole("region", {
    name: "History coverage",
    exact: true,
  });
  await expect(coverage.getByText(/Shared with you/)).toBeVisible();
  await expect(coverage.getByRole("button")).toHaveCount(0);
  expect(fixture.writes).toEqual([]);
});

test("unknown source date does not claim that booked records are absent", async ({
  page,
}) => {
  const fixture = await spendingWorkspaceFixture(page);
  fixture.setReport({
    ...spendingReport,
    provenance: { ...spendingReport.provenance, latestRecordDate: null },
  });
  await page.goto(`/dashboard?${query}`);
  const source = page.getByRole("region", {
    name: "Report source",
    exact: true,
  });
  await expect(
    source.getByText("No latest booked date is available.", { exact: true }),
  ).toBeVisible();
  await expect(
    source.getByText("No booked records in this scope.", { exact: true }),
  ).toHaveCount(0);
});

test("an exact refund-adjusted allowance may exceed the input money range", async ({
  page,
}) => {
  const fixture = await spendingWorkspaceFixture(page);
  const { summary, budget } = spendingReport;
  if (!summary || !budget) throw Error("Missing synthetic report");
  const refund = "9".repeat(40);
  fixture.setReport({
    ...spendingReport,
    summary: {
      ...summary,
      income: { amountMinor: "0", currency: "GBP" },
      spending: { amountMinor: `-${refund}`, currency: "GBP" },
      netCash: { amountMinor: refund, currency: "GBP" },
      categories: [
        {
          category: "Eating out",
          grouped: false,
          spending: { amountMinor: `-${refund}`, currency: "GBP" },
          count: 1,
        },
      ],
    },
    budget: {
      ...budget,
      lines: [budget.lines[0]].filter((line) => line !== undefined),
    },
  });
  await page.goto(`/budgets?${query}`);
  await expect(
    page.getByText(
      "£100,000,000,000,000,000,000,000,000,000,000,000,049.99 left",
      { exact: true },
    ),
  ).toBeVisible();
});
