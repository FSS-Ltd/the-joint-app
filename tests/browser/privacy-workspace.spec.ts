import { expect, test } from "@playwright/test";
import { accounts, householdId } from "../fixtures/account-workspace.js";
import { privacyWorkspaceFixture } from "../fixtures/privacy-workspace.js";
test.use({ serviceWorkers: "block" });

test("privacy keeps export scope explicit and clears selection on authority refresh", async ({
  page,
}) => {
  await privacyWorkspaceFixture(page);
  await page.goto("/settings/privacy");
  const scope = page.getByRole("region", { name: "Export scope", exact: true });
  await expect(scope).toContainText("4 loaded accounts · 0 selected");
  for (const width of [390, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await page.evaluate(() => {
      if (document.activeElement instanceof HTMLElement)
        document.activeElement.blur();
      window.scrollTo(0, 0);
    });
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
    await page.screenshot({
      path: `/tmp/joint-ui6-normal-privacy-${width}.png`,
      fullPage: true,
    });
  }
  await page.getByRole("checkbox", { name: /Everyday account/ }).check();
  await expect(scope).toContainText("4 loaded accounts · 1 selected");
  await expect(
    page.getByRole("checkbox", {
      name: /Shared household saving.*Values only/,
    }),
  ).toBeVisible();
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(scope).toContainText("4 loaded accounts · 0 selected");
  await expect(
    page.getByRole("button", { name: "Request CSV export" }),
  ).toBeDisabled();
});

test("export sends only the chosen account and retains the download authority note", async ({
  page,
}) => {
  const fixture = await privacyWorkspaceFixture(page);
  await page.goto("/settings/privacy");
  await page.getByRole("checkbox", { name: /Everyday account/ }).check();
  await page.getByRole("button", { name: "Request CSV export" }).click();
  await expect(page.getByRole("link", { name: "Download CSV" })).toBeVisible();
  expect(fixture.exportBodies).toEqual([{ accountIds: [accounts[0]?.id] }]);
  await expect(
    page.getByRole("link", { name: "Download CSV" }),
  ).toHaveAttribute(
    "href",
    `/api/households/${householdId}/exports/77777777-7777-4777-8777-777777777777/download`,
  );
  await expect(
    page.getByText("Access is checked again when you download.", {
      exact: false,
    }),
  ).toBeVisible();
});

test("leave and delete remain distinct confirmed choices with safe cancellation", async ({
  page,
}) => {
  await privacyWorkspaceFixture(page);
  await page.goto("/settings/privacy");
  for (const [choice, confirm] of [
    ["Leave household", "Confirm and leave household"],
    ["Delete my account", "Confirm and delete my account"],
  ]) {
    await page.getByRole("button", { name: choice, exact: true }).click();
    const button = page.getByRole("button", { name: confirm, exact: true });
    await expect(button).toBeDisabled();
    await page
      .getByRole("checkbox", { name: /I understand these consequences/ })
      .check();
    await expect(button).toBeEnabled();
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(button).toHaveCount(0);
  }
  const order = await page.locator("main h2").allTextContents();
  expect(order.indexOf("Free essentials")).toBeLessThan(
    order.indexOf("Leave or delete"),
  );
});

test("archive has compact selectable accounts, exact read-only history and pagination", async ({
  page,
}) => {
  await privacyWorkspaceFixture(page);
  await page.goto("/archive");
  const navigation = page.getByRole("region", {
    name: "Archived accounts",
    exact: true,
  });
  await expect(navigation).toContainText("3 loaded accounts");
  const account = navigation.getByRole("button", {
    name: "Everyday account · Read history",
    exact: true,
  });
  await account.focus();
  await page.keyboard.press("Enter");
  await expect(account).toHaveAttribute("aria-pressed", "true");
  const history = page.getByRole("region", {
    name: "Archived history",
    exact: true,
  });
  await expect(history).toContainText("£820.00");
  await expect(history).toContainText("22 Oct 2026");
  await expect(history).toContainText("Cafe sample");
  await expect(history).toContainText("-£12.00");
  await history.getByRole("button", { name: "Load more history" }).click();
  await expect(history).toContainText("Household contribution sample");
  await expect(history).toContainText("£100.00");
  for (const width of [390, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await page.evaluate(() => {
      if (document.activeElement instanceof HTMLElement)
        document.activeElement.blur();
      window.scrollTo(0, 0);
    });
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
    await page.screenshot({
      path: `/tmp/joint-ui6-normal-archive-${width}.png`,
      fullPage: true,
    });
  }
  for (const name of ["Record transaction", "Save sharing", "Import CSV"])
    await expect(page.getByRole("button", { name, exact: true })).toHaveCount(
      0,
    );
});

test("archive refresh removes stale history on failed or empty account scope", async ({
  page,
}) => {
  const fixture = await privacyWorkspaceFixture(page);
  await page.goto("/archive");
  await page
    .getByRole("button", {
      name: "Everyday account · Read history",
      exact: true,
    })
    .click();
  const history = page.getByRole("region", {
    name: "Archived history",
    exact: true,
  });
  await expect(history).toContainText("Cafe sample");
  fixture.failArchive(true);
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(
    page.getByText("Archive unavailable.", { exact: true }),
  ).toBeVisible();
  await expect(history).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Request CSV export" }),
  ).toBeDisabled();
  fixture.failArchive(false);
  fixture.setAccounts([]);
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  await expect(
    page.getByText("No accounts owned by you are available in the archive."),
  ).toBeVisible();
  await expect(history).toHaveCount(0);
});
