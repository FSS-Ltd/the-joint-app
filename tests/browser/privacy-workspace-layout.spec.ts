import { expect, test } from "@playwright/test";
import { accounts } from "../fixtures/account-workspace.js";
import { firstTransaction } from "../fixtures/activity-workspace.js";
import { privacyWorkspaceFixture } from "../fixtures/privacy-workspace.js";
test.use({ serviceWorkers: "block" });

for (const width of [320, 390, 800, 1280]) {
  for (const route of ["settings/privacy", "archive"]) {
    test(`${route} remains readable at ${width}px and 200% zoom`, async ({
      page,
    }) => {
      const fixture = await privacyWorkspaceFixture(page);
      const source = accounts[0];
      if (!source?.latestValuation) throw Error("Missing synthetic valuation");
      const label = "ArchivedAccountNameWithoutBreaks".repeat(3).slice(0, 80);
      fixture.setAccounts([
        {
          ...source,
          label,
          latestValuation: {
            ...source.latestValuation,
            money: { amountMinor: "-9223372036854775808", currency: "GBP" },
          },
        },
      ]);
      fixture.setHistory([
        {
          ...firstTransaction,
          description: "ArchivedDescriptionWithoutBreaks".repeat(8),
          money: { amountMinor: "-9223372036854775808", currency: "GBP" },
          note: { body: "PrivateNoteWithoutBreaks".repeat(8), version: 1 },
        },
      ]);
      await page.setViewportSize({ width, height: 900 });
      await page.emulateMedia({ reducedMotion: "reduce" });
      await page.goto(`/${route}`);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await expect(
        page.getByRole("checkbox", { name: new RegExp(label) }),
      ).toBeVisible();
      if (route === "archive") {
        await page
          .getByRole("button", { name: `${label} · Read history`, exact: true })
          .click();
        await expect(
          page.getByText("PrivateNoteWithoutBreaks".repeat(8), {
            exact: false,
          }),
        ).toBeVisible();
      }
      for (const zoom of ["1", "2"]) {
        await page.evaluate((value) => {
          document.body.style.zoom = value;
        }, zoom);
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        ).toBe(true);
        const checkbox = page.getByRole("checkbox").first();
        await checkbox.check();
        await expect(
          page.getByRole("button", { name: "Request CSV export" }),
        ).toBeEnabled();
        const target = await checkbox.locator("..").boundingBox();
        expect(target?.height).toBeGreaterThanOrEqual(44);
        if (route === "archive") {
          const history = page.getByRole("region", {
            name: "Archived history",
            exact: true,
          });
          await expect(
            history.getByText("-£92,233,720,368,547,758.08", { exact: true }),
          ).toHaveCount(2);
          for (const amount of [
            history.locator(".archive-balance"),
            history.locator(".archive-record-amount"),
          ]) {
            const groups = await amount.evaluate((element) => {
              const walker = document.createTreeWalker(
                element,
                NodeFilter.SHOW_TEXT,
              );
              const nodes: Text[] = [];
              for (let node = walker.nextNode(); node; node = walker.nextNode())
                if (node instanceof Text && node.textContent?.trim())
                  nodes.push(node);
              const first = nodes[0],
                last = nodes.at(-1);
              if (!first || !last) throw Error("Missing displayed amount");
              const sign = document.createRange();
              sign.setStart(first, 0);
              sign.setEnd(first, Math.min(3, first.length));
              const fraction = document.createRange();
              fraction.setStart(last, Math.max(0, last.length - 4));
              fraction.setEnd(last, last.length);
              return {
                sign: sign.getClientRects().length,
                fraction: fraction.getClientRects().length,
              };
            });
            expect(groups).toEqual({ sign: 1, fraction: 1 });
          }
        } else {
          await page
            .getByRole("button", { name: "Delete my account", exact: true })
            .click();
          await expect(
            page.getByRole("button", { name: "Confirm and delete my account" }),
          ).toBeDisabled();
          await page
            .getByRole("button", { name: "Cancel", exact: true })
            .click();
        }
      }
      await page.evaluate(() => {
        document.body.style.zoom = "";
        window.scrollTo(0, 0);
      });
      if (width === 390 || width === 1280)
        await page.screenshot({
          path: `/tmp/joint-ui6-${route.replace("/", "-")}-${width}.png`,
          fullPage: true,
        });
    });
  }
}
