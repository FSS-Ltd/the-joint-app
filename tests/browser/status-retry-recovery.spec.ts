import { expect, test, type Page } from "@playwright/test";
import type { ExportStatus } from "../../packages/contracts/dist/index.js";
import { householdId } from "../fixtures/account-workspace.js";
import {
  importBatch,
  importWorkspaceFixture,
} from "../fixtures/import-workspace.js";
import { privacyWorkspaceFixture } from "../fixtures/privacy-workspace.js";
import {
  emitStatusSignal,
  statusSignalCounts,
} from "../fixtures/status-signals.js";

test.use({ serviceWorkers: "block" });

test.beforeEach(async ({ page }) => {
  // Session and stream timers must start in the same clock domain.
  await page.clock.install();
});

async function exhaustRetries(
  page: Page,
  initialClosed: number,
): Promise<void> {
  let closed = initialClosed + 1;
  await expect
    .poll(async () => (await statusSignalCounts(page))?.closed)
    .toBe(closed);
  for (const delay of [1000, 2000, 4000, 8000, 16000]) {
    await page.clock.fastForward(delay);
    closed++;
    await expect
      .poll(async () => (await statusSignalCounts(page))?.closed)
      .toBe(closed);
  }
}

test("manual retry preserves opaque import choices after transient retries exhaust", async ({
  page,
}) => {
  const fixture = await importWorkspaceFixture(page);
  await page.goto(`/imports/${importBatch.id}`);
  const keep = page
    .getByRole("group", { name: "Decision for row 2", exact: true })
    .getByRole("radio", { name: "Keep", exact: true });
  await keep.check();
  const baseline = (await statusSignalCounts(page))?.closed ?? 0;
  fixture.fail(true);
  await emitStatusSignal(page, "change");
  await exhaustRetries(page, baseline);
  await expect(
    page.getByText("Reconnecting to live import updates…", { exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("region", { name: "Import overview", exact: true }),
  ).toHaveCount(0);
  fixture.fail(false);
  await page
    .getByRole("button", { name: "Retry import status", exact: true })
    .click();
  await expect(keep).toBeChecked();
});

for (const [status, archive] of [
  [429, false],
  [408, true],
] as const)
  test(`manual retry recovers the same ${archive ? "archive" : "household"} export after HTTP ${status} retries exhaust`, async ({
    page,
  }) => {
    await privacyWorkspaceFixture(page);
    const path = archive
      ? "/api/me/archive/exports"
      : `/api/households/${householdId}/exports`;
    const job: ExportStatus = {
      id: "77777777-7777-4777-8777-777777777777",
      state: "READY",
      createdAt: "2026-10-25T12:00:00.000Z",
      expiresAt: "2099-01-01T00:00:00.000Z",
      downloadExpiresAt: "2099-01-01T00:00:00.000Z",
    };
    let unavailable = true;
    let submissions = 0;
    await page.route(`**${path}**`, (route) => {
      if (route.request().method() === "POST") {
        submissions++;
        return route.fulfill({ json: { ...job, state: "QUEUED" } });
      }
      return unavailable
        ? route.fulfill({
            status,
            json: {
              error: {
                code: "TEMPORARILY_UNAVAILABLE",
                message: "Export status temporarily unavailable.",
              },
            },
          })
        : route.fulfill({ json: job });
    });
    await page.goto(archive ? "/archive" : "/settings/privacy");
    await page.getByRole("checkbox", { name: /Everyday account/ }).check();
    await page
      .getByRole("button", { name: "Request CSV export", exact: true })
      .click();
    await exhaustRetries(page, 0);
    await expect(
      page.getByText("Checking live export status…", { exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("link", { name: "Download CSV", exact: true }),
    ).toHaveCount(0);
    unavailable = false;
    const retry = page.getByRole("button", {
      name: "Retry export status",
      exact: true,
    });
    await expect(retry).toBeVisible();
    await retry.click();
    await expect(
      page.getByRole("link", { name: "Download CSV", exact: true }),
    ).toHaveAttribute("href", `${path}/${job.id}/download`);
    expect(submissions).toBe(1);
  });
