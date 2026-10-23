import { expect, test } from "@playwright/test";
import {
  accounts,
  accountWorkspaceFixture,
  nextAccount,
} from "../fixtures/account-workspace.js";

test.use({ serviceWorkers: "block" });

test("account collection uses compact permission-labelled rows and honest pagination", async ({
  page,
}) => {
  await accountWorkspaceFixture(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/accounts");
  const overview = page.getByRole("region", { name: "Your account overview" });
  await expect(
    overview.getByText("4 accounts loaded", { exact: true }),
  ).toBeVisible();
  await expect(
    overview.getByText("More accounts are available.", { exact: true }),
  ).toBeVisible();
  await expect(
    overview.getByRole("link", { name: "Import CSV", exact: true }),
  ).toHaveAttribute("href", "/imports");
  await overview
    .getByRole("link", { name: "Add account", exact: true })
    .click();
  await expect(page.locator("#add-account")).toBeFocused();
  const owned = page.locator(".account-card").filter({
    has: page.getByRole("link", { name: "Everyday account", exact: true }),
  });
  const shared = page.locator(".account-card").filter({
    has: page.getByRole("link", {
      name: "Shared household saving",
      exact: true,
    }),
  });
  await expect(owned.getByText("£820.00", { exact: true })).toBeVisible();
  await expect(
    owned.getByText("Sole owner: you", { exact: true }),
  ).toBeVisible();
  await expect(shared.getByText("Values only", { exact: true })).toBeVisible();
  await expect(shared.getByText(/Partial value/)).toBeVisible();
  await expect(
    page.getByText("Outstanding debt", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("No value yet", { exact: true })).toBeVisible();
  expect((await owned.boundingBox())?.height).toBeLessThan(250);
  await page
    .getByRole("button", { name: "Load more accounts", exact: true })
    .click();
  await expect(
    overview.getByText("5 accounts loaded", { exact: true }),
  ).toBeVisible();
  await expect(
    overview.getByText("More accounts are available.", { exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: "Another visible account", exact: true }),
  ).toBeVisible();
});

test("selected account workspace keeps shared values-only boundaries and a desktop account column", async ({
  page,
}) => {
  const fixture = await accountWorkspaceFixture(page);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`/accounts/${accounts[1]?.id}`);
  const selector = page.getByRole("navigation", {
    name: "Account selection",
    exact: true,
  });
  const selected = selector.getByRole("link", {
    name: /Shared household saving/,
  });
  await expect(selected).toHaveAttribute("aria-current", "page");
  await expect(
    page.getByRole("heading", { level: 1, name: "Shared household saving" }),
  ).toBeVisible();
  await expect(
    page
      .getByRole("main")
      .getByRole("link", { name: "Import CSV", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: "View activity", exact: true }),
  ).toHaveCount(0);
  await expect(page.getByLabel("Account name", { exact: true })).toHaveCount(0);
  const column = await selector.boundingBox(),
    summary = await page.locator(".account-detail-summary").boundingBox();
  expect(
    column && summary && column.x + column.width <= summary.x,
  ).toBeTruthy();
  const initial = fixture.listReads();
  await page.waitForTimeout(350);
  expect(fixture.listReads()).toBe(initial);
  const accountLoaded = page.waitForResponse((response) =>
    response
      .url()
      .endsWith(
        `/api/households/${accounts[0]?.householdId}/accounts/${accounts[0]?.id}`,
      ),
  );
  await selector.getByRole("link", { name: /Everyday account/ }).click();
  await accountLoaded;
  await expect(
    page.getByRole("heading", { level: 1, name: "Everyday account" }),
  ).toBeVisible();
  await expect(
    page
      .getByRole("main")
      .getByRole("link", { name: "Import CSV", exact: true }),
  ).toBeVisible();
});

test("account selector failure preserves the authorised detail and offers explicit retry", async ({
  page,
}) => {
  const fixture = await accountWorkspaceFixture(page);
  fixture.failList(true);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`/accounts/${accounts[0]?.id}`);
  const selector = page.getByRole("navigation", {
    name: "Account selection",
    exact: true,
  });
  await expect(selector.getByRole("alert")).toBeVisible();
  await expect(
    page
      .locator(".account-detail-summary")
      .getByText("£820.00", { exact: true }),
  ).toBeVisible();
  fixture.failList(false);
  await selector
    .getByRole("button", { name: "Try again", exact: true })
    .click();
  await expect(
    selector.getByRole("link", { name: /Everyday account/ }),
  ).toHaveAttribute("aria-current", "page");
});

test("mobile account selection retains a current account beyond the first page", async ({
  page,
}) => {
  await accountWorkspaceFixture(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/accounts/${nextAccount.id}`);
  const selector = page.getByRole("navigation", {
    name: "Account selection",
    exact: true,
  });
  await selector.locator("summary").focus();
  await page.keyboard.press("Enter");
  await expect(
    selector.getByRole("link", { name: /Another visible account/ }),
  ).toHaveAttribute("aria-current", "page");
  await selector
    .getByRole("button", { name: "Load more accounts", exact: true })
    .click();
  await expect(
    selector.getByRole("link", { name: /Another visible account/ }),
  ).toHaveCount(1);
  await selector.getByRole("link", { name: /Everyday account/ }).focus();
  await Promise.all([
    page.waitForResponse((response) =>
      response
        .url()
        .endsWith(
          `/api/households/${accounts[0]?.householdId}/accounts/${accounts[0]?.id}`,
        ),
    ),
    page.waitForURL(`**/accounts/${accounts[0]?.id}`),
    page.keyboard.press("Enter"),
  ]);
  await expect(
    page.getByRole("heading", { level: 1, name: "Everyday account" }),
  ).toBeVisible();
});

test("long account names and exact large negative values remain readable", async ({
  page,
}) => {
  await accountWorkspaceFixture(page);
  const original = accounts[0];
  if (!original?.latestValuation) throw Error("Missing synthetic valuation");
  const label =
    "A household account with a deliberately long descriptive name for narrow screens";
  await page.route(`**/api/households/*/accounts/${original.id}`, (route) =>
    route.fulfill({
      json: {
        ...original,
        label,
        latestValuation: {
          ...original.latestValuation,
          money: { amountMinor: "-9223372036854775808", currency: "GBP" },
        },
      },
    }),
  );
  await page.setViewportSize({ width: 320, height: 900 });
  await page.goto(`/accounts/${original.id}`);
  await expect(
    page.getByRole("heading", { level: 1, name: label }),
  ).toBeVisible();
  await expect(
    page
      .locator(".account-detail-summary")
      .getByText("-£92,233,720,368,547,758.08", { exact: true }),
  ).toBeVisible();
  for (const zoom of ["1", "2"]) {
    await page.evaluate((value) => {
      document.body.style.zoom = value;
    }, zoom);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
});

for (const width of [320, 390, 800, 1280]) {
  test(`account workspace remains readable at ${width}px and enlarged text`, async ({
    page,
  }) => {
    await accountWorkspaceFixture(page);
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    for (const path of ["/accounts", `/accounts/${accounts[0]?.id}`]) {
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await expect(
        page.getByText("£820.00", { exact: true }).first(),
      ).toBeVisible();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      if (width !== 320)
        await page.screenshot({
          path: `/tmp/joint-ui2-${path === "/accounts" ? "list" : "detail"}-${width}.png`,
          fullPage: true,
        });
      await page.evaluate(() => {
        document.body.style.zoom = "2";
      });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await page.evaluate(() => {
        document.body.style.zoom = "";
      });
    }
  });
}
