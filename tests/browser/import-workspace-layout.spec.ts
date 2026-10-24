import { expect, test } from "@playwright/test";
import {
  importAccount,
  importBatch,
  importRows,
  importWorkspaceFixture,
} from "../fixtures/import-workspace.js";
test.use({ serviceWorkers: "block" });
const detailPath = `/imports/${importBatch.id}`;

for (const width of [320, 390, 800, 1280]) {
  for (const surface of ["upload", "detail"] as const) {
    test(`import ${surface} remains readable at ${width}px and 200% zoom`, async ({
      page,
    }) => {
      const fixture = await importWorkspaceFixture(page);
      const row = importRows[0];
      if (!row || row.status !== "VALID")
        throw Error("Missing synthetic valid row");
      fixture.setRows([
        {
          ...row,
          description:
            "A deliberately long household CSV source description ".repeat(4),
          sourceId: "long-source-identifier-".repeat(6),
          money: { amountMinor: "-9223372036854775808", currency: "GBP" },
        },
        ...importRows.slice(1),
      ]);
      await page.setViewportSize({ width, height: 900 });
      await page.emulateMedia({ reducedMotion: "reduce" });
      const path =
        surface === "detail"
          ? detailPath
          : `/imports?account=${importAccount.id}`;
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      if (path !== detailPath) {
        await page.getByLabel("CSV file", { exact: true }).setInputFiles({
          name: "synthetic.csv",
          mimeType: "text/csv",
          buffer: Buffer.from(
            "Date,Description,Amount,Credit\n2026-10-22,Sample,12.00,0.00",
          ),
        });
        await page
          .getByRole("button", { name: "Inspect columns", exact: true })
          .click();
        await page
          .getByRole("combobox", { name: "Amount columns", exact: true })
          .selectOption("DEBIT_CREDIT");
        await expect(
          page.getByRole("combobox", { name: "Debit column", exact: true }),
        ).toBeVisible();
        await expect(
          page.getByRole("combobox", { name: "Credit column", exact: true }),
        ).toBeVisible();
        await expect(
          page.getByRole("combobox", {
            name: "Positive amounts mean",
            exact: true,
          }),
        ).toHaveCount(0);
      }
      if (surface === "upload" && width === 1280) {
        const fits = await page
          .getByRole("combobox", { name: "Amount columns", exact: true })
          .evaluate((element) => {
            if (!(element instanceof HTMLSelectElement))
              throw Error("Expected native amount selector");
            const context = document.createElement("canvas").getContext("2d");
            if (!context) throw Error("Text measurement unavailable");
            const style = getComputedStyle(element);
            context.font = style.font;
            const text = element.selectedOptions[0]?.textContent ?? "";
            return (
              context.measureText(text).width +
                parseFloat(style.paddingLeft) +
                parseFloat(style.paddingRight) +
                24 <=
              element.clientWidth
            );
          });
        expect(
          fits,
          "Full amount layout must remain readable without truncation",
        ).toBe(true);
      }
      if (path === detailPath)
        await expect(
          page.getByText("-£92,233,720,368,547,758.08", { exact: true }),
        ).toBeVisible();
      for (const zoom of ["1", "2"]) {
        await page.evaluate((value) => {
          document.body.style.zoom = value;
        }, zoom);
        if (path === detailPath) {
          await expect(
            page.getByText("-£92,233,720,368,547,758.08", { exact: true }),
          ).toBeVisible();
          const metric = await page
            .getByRole("region", { name: "Import overview", exact: true })
            .locator("dl > div")
            .first()
            .boundingBox();
          expect(metric?.width).toBeGreaterThanOrEqual(100);
        }
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        ).toBe(true);
      }
      await page.evaluate(() => {
        document.body.style.zoom = "";
        window.scrollTo(0, 0);
      });
      if (width === 390 || width === 1280)
        await page.screenshot({
          path: `/tmp/joint-ui4-${path === detailPath ? "detail" : "upload"}-${width}.png`,
          fullPage: true,
        });
    });
  }
}
