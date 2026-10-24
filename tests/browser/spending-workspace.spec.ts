import { expect, test } from "@playwright/test";
import {
  reportAccount,
  spendingWorkspaceFixture,
} from "../fixtures/spending-workspace.js";
test.use({ serviceWorkers: "block" });
const query = `month=2026-01&accountIds=${reportAccount.id}`;

test("saved caps distinguish remaining, exhausted and overspent values with conditional saving guidance", async ({
  page,
}) => {
  const fixture = await spendingWorkspaceFixture(page);
  await page.goto(`/budgets?${query}`);
  const cards = page.getByRole("region", {
    name: "Category caps",
    exact: true,
  });
  const eating = cards.getByRole("article").filter({
    has: page.getByRole("heading", { name: "Eating out", exact: true }),
  });
  await expect(
    eating.getByText("£8.00 over limit", { exact: true }),
  ).toBeVisible();
  await expect(eating.getByText("£8.00 over limit", { exact: true })).toHaveCSS(
    "color",
    "rgb(156, 56, 56)",
  );
  await expect(cards.getByText("£0.00 left", { exact: true })).toHaveCSS(
    "color",
    "rgb(156, 56, 56)",
  );
  await expect(eating.getByRole("meter").locator(".cap-excess")).toHaveCSS(
    "background-color",
    "rgb(156, 56, 56)",
  );
  await expect(
    eating.getByText(/£8.00 less to put toward saving/),
  ).toBeVisible();
  await expect(
    eating.getByText(/if other spending stays as planned/i),
  ).toBeVisible();
  await expect(cards.getByText("£18.00 left", { exact: true })).toBeVisible();
  await expect(cards.getByText("£0.00 left", { exact: true })).toBeVisible();
  await expect(cards.getByText("Limit reached", { exact: true })).toBeVisible();
  await expect(
    cards.getByRole("meter", { name: "Eating out cap used", exact: true }),
  ).toHaveAttribute("aria-valuenow", "100");
  await expect(cards.getByText(/incomplete/i).first()).toBeVisible();
  const reads = fixture.reads();
  await page.waitForTimeout(500);
  expect(fixture.reads()).toBe(reads);
  expect(fixture.writes).toEqual([]);
  for (const width of [390, 1280]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({
      path: `/tmp/joint-ui5-normal-budgets-${width}.png`,
      fullPage: true,
    });
  }
});

test("home distinguishes report source date, cash movement and saved caps", async ({
  page,
}) => {
  await spendingWorkspaceFixture(page);
  await page.goto(`/dashboard?${query}`);
  await expect(
    page.getByRole("region", { name: "Report source", exact: true }),
  ).toContainText("22 Jan 2026");
  const summary = page.getByRole("region", {
    name: "Spending summary",
    exact: true,
  });
  await expect(
    summary.getByRole("heading", { name: "£140.00", exact: true }),
  ).toBeVisible();
  await expect(
    summary.getByText("Net cash movement", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Category caps", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "View all category caps", exact: true }),
  ).toHaveAttribute("href", `/budgets?${query}`);
  await expect(
    page.getByText("Available this month", { exact: true }),
  ).toHaveCount(0);
  for (const width of [390, 1280]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({
      path: `/tmp/joint-ui5-normal-dashboard-${width}.png`,
      fullPage: true,
    });
  }
});

test("budget editing retains exact values and optimistic version while review navigation retains scope", async ({
  page,
}) => {
  const fixture = await spendingWorkspaceFixture(page);
  await page.goto(`/budgets?${query}`);
  const first = page.getByRole("group", {
    name: "Budget category 1",
    exact: true,
  });
  await first.getByLabel("Monthly limit · GBP", { exact: true }).fill("60.00");
  const save = page.getByRole("button", {
    name: "Save monthly budget",
    exact: true,
  });
  await save.focus();
  await Promise.all([
    page.waitForResponse((response) =>
      new URL(response.url()).pathname.includes("/reports/spending"),
    ),
    save.press("Enter"),
  ]);
  expect(fixture.writes).toHaveLength(1);
  expect(fixture.writes[0]).toMatchObject({
    method: "PUT",
    version: '"1"',
    body: {
      accountIds: [reportAccount.id],
      lines: [
        {
          category: "Eating out",
          limit: { amountMinor: "6000", currency: "GBP" },
        },
        {
          category: "Essentials",
          limit: { amountMinor: "5000", currency: "GBP" },
        },
        {
          category: "Transport",
          limit: { amountMinor: "5000", currency: "GBP" },
        },
      ],
    },
  });
  await expect(
    page
      .getByRole("region", { name: "Category caps", exact: true })
      .getByText("£2.00 left", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Review this month", exact: true }),
  ).toHaveAttribute("href", `/review?${query}`);
});
