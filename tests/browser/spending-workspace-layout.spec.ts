import { expect, test } from "@playwright/test";
import {
  reportAccount,
  spendingReport,
  spendingWorkspaceFixture,
} from "../fixtures/spending-workspace.js";
test.use({ serviceWorkers: "block" });
for (const width of [320, 390, 800, 1280]) {
  for (const mode of ["dashboard", "budgets", "review"]) {
    test(`${mode} remains readable at ${width}px and 200% zoom`, async ({
      page,
    }) => {
      const fixture = await spendingWorkspaceFixture(page);
      const category = "Averylonghouseholdcategorywithoutbreaks"
        .repeat(2)
        .slice(0, 80);
      const summary = spendingReport.summary;
      if (!summary || !spendingReport.budget)
        throw Error("Missing synthetic report");
      fixture.setReport({
        ...spendingReport,
        scope: spendingReport.scope.map((account) => ({
          ...account,
          label: "SelectedHouseholdAccountWithoutBreaks".repeat(3).slice(0, 80),
        })),
        summary: {
          ...summary,
          spending: { amountMinor: "9223372036854775808", currency: "GBP" },
          categories: [
            {
              category,
              grouped: false,
              count: 1,
              spending: { amountMinor: "9223372036854775808", currency: "GBP" },
            },
          ],
        },
        budget: {
          ...spendingReport.budget,
          lines: [
            {
              category,
              limit: { amountMinor: "9223372036854775807", currency: "GBP" },
            },
          ],
        },
      });
      await page.setViewportSize({ width, height: 900 });
      await page.emulateMedia({ reducedMotion: "reduce" });
      await page.goto(`/${mode}?month=2026-01&accountIds=${reportAccount.id}`);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await expect(
        page.getByRole("button", { name: "Refresh report", exact: true }),
      ).toBeEnabled();
      for (const zoom of ["1", "2"]) {
        await page.evaluate((value) => {
          document.body.style.zoom = value;
        }, zoom);
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        ).toBe(true);
        const month = await page
          .getByLabel("Calendar month", { exact: true })
          .boundingBox();
        expect(month?.width).toBeGreaterThanOrEqual(100);
        await expect(
          page.getByText("£0.01 over limit", { exact: true }),
        ).toBeVisible();
      }
      await page.evaluate(() => {
        document.body.style.zoom = "";
        window.scrollTo(0, 0);
      });
      if (width === 390 || width === 1280)
        await page.screenshot({
          path: `/tmp/joint-ui5-${mode}-${width}.png`,
          fullPage: true,
        });
    });
  }
}
