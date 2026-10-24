import { expect, test } from "@playwright/test";
import {
  activityAccount,
  activityWorkspaceFixture,
  firstTransaction,
} from "../fixtures/activity-workspace.js";
import { householdId } from "../fixtures/account-workspace.js";

test.use({ serviceWorkers: "block" });

test("activity ledger keeps search visible, compact signed rows and honest loaded counts", async ({
  page,
}) => {
  const fixture = await activityWorkspaceFixture(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/activity?account=${activityAccount.id}`);
  const ledger = page.getByRole("region", {
    name: "Booked activity",
    exact: true,
  });
  await expect(
    ledger.getByText("1 record loaded", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByLabel("Search description", { exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("Category", { exact: true })).not.toBeVisible();
  const row = ledger.getByRole("link", { name: /Cafe sample/ });
  await expect(row.getByText("-£12.00", { exact: true })).toBeVisible();
  await expect(row.getByText(/CSV import/)).toBeVisible();
  expect((await row.boundingBox())?.height).toBeLessThan(170);
  await ledger.getByRole("button", { name: "Load more activity" }).click();
  await expect(
    ledger.getByText("2 records loaded", { exact: true }),
  ).toBeVisible();
  await expect(ledger.getByText("+£100.00", { exact: true })).toBeVisible();
  await expect(
    ledger.getByRole("button", { name: "Load more activity" }),
  ).toHaveCount(0);
  const reads = fixture.reads();
  await page.waitForTimeout(500);
  expect(fixture.reads()).toBe(reads);
  await row.focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(new RegExp(`/activity/${firstTransaction.id}$`));
  await expect(
    page.getByRole("heading", { name: "Cafe sample", exact: true }),
  ).toBeVisible();
});

test("activity filters restore URL values and submit every existing field through keyboard controls", async ({
  page,
}) => {
  const fixture = await activityWorkspaceFixture(page);
  await page.goto(
    `/activity?account=${activityAccount.id}&month=2026-10&search=Cafe&category=Eating%20out&classificationKind=EXPENSE&uncategorized=true`,
  );
  await expect(
    page.getByLabel("Search description", { exact: true }),
  ).toHaveValue("Cafe");
  const summary = page.locator("summary").filter({ hasText: "More filters" });
  await summary.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByLabel("Month", { exact: true })).toHaveValue(
    "2026-10",
  );
  await expect(page.getByLabel("Category", { exact: true })).toHaveValue(
    "Eating out",
  );
  await expect(page.getByLabel("Uncategorized only")).toBeChecked();
  await page
    .getByLabel("Search description", { exact: true })
    .fill("contribution");
  await page.getByLabel("Category", { exact: true }).fill("Saving");
  await page
    .getByRole("combobox", { name: "Financial type", exact: true })
    .selectOption("INCOME");
  await summary.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByLabel("Category", { exact: true })).not.toBeVisible();
  await page
    .getByRole("button", { name: "Apply activity filters", exact: true })
    .click();
  await expect
    .poll(() => fixture.queries.at(-1)?.searchParams.get("search"))
    .toBe("contribution");
  const query = fixture.queries.at(-1)?.searchParams;
  expect(query?.get("accountId")).toBe(activityAccount.id);
  expect(query?.get("category")).toBe("Saving");
  expect(query?.get("month")).toBe("2026-10");
  expect(query?.get("classificationKind")).toBe("INCOME");
  expect(query?.get("uncategorized")).toBe("true");
});

test("activity failure and empty results remain distinct with explicit retry", async ({
  page,
}) => {
  const fixture = await activityWorkspaceFixture(page);
  fixture.fail(true);
  await page.goto(`/activity?account=${activityAccount.id}`);
  const ledger = page.getByRole("region", {
    name: "Booked activity",
    exact: true,
  });
  await expect(ledger.getByRole("alert")).toBeVisible();
  await expect(
    ledger.getByRole("heading", { name: "No activity yet" }),
  ).toHaveCount(0);
  fixture.fail(false);
  fixture.empty(true);
  await ledger.getByRole("button", { name: "Refresh activity" }).click();
  await expect(
    ledger.getByRole("heading", { name: "No activity yet" }),
  ).toBeVisible();
  await expect(ledger.getByRole("alert")).toHaveCount(0);
});

test("shared source summary preserves CSV immutability and private note boundaries", async ({
  page,
}) => {
  await activityWorkspaceFixture(page);
  await page.route(
    `**/api/households/${householdId}/transactions/${firstTransaction.id}`,
    (route) =>
      route.fulfill({
        json: {
          ...firstTransaction,
          permissions: { canCorrect: false, canClassify: false, canNote: true },
        },
      }),
  );
  await page.goto(`/activity/${firstTransaction.id}`);
  const summary = page.getByRole("region", {
    name: "Transaction source",
    exact: true,
  });
  await expect(summary.getByText("-£12.00", { exact: true })).toBeVisible();
  await expect(summary.getByText(/preserve the source record/)).toBeVisible();
  await expect(summary.getByText(/owner controls corrections/)).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Correct this entry" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Save classification" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "Your private note" }),
  ).toBeVisible();
});

test("shared activity keeps owner-only entry and import controls unavailable", async ({
  page,
}) => {
  await activityWorkspaceFixture(page);
  await page.route(
    `**/api/households/${householdId}/accounts/${activityAccount.id}`,
    (route) =>
      route.fulfill({
        json: {
          ...activityAccount,
          ownership: "SHARED",
          permissions: { canEdit: false, canValue: false, canShare: false },
          sharing: null,
        },
      }),
  );
  await page.goto(`/activity?account=${activityAccount.id}`);
  await expect(
    page.getByRole("heading", { name: "Cafe sample", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Shared with you · Values and details", { exact: true }),
  ).toBeVisible();
  await expect(
    page
      .getByRole("main")
      .getByRole("link", { name: "Import CSV", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Record transaction", exact: true }),
  ).toHaveCount(0);
});

for (const width of [320, 390, 800, 1280]) {
  test(`activity workspace remains readable at ${width}px and 200% zoom`, async ({
    page,
  }) => {
    await activityWorkspaceFixture(page);
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    for (const path of [
      `/activity?account=${activityAccount.id}`,
      `/activity/${firstTransaction.id}`,
    ]) {
      await page.goto(path);
      await expect(
        page.getByText("-£12.00", { exact: true }).first(),
      ).toBeVisible();
      if (path.includes(firstTransaction.id)) {
        const split = page.getByRole("group", {
          name: "Split component 1",
          exact: true,
        });
        const field = await split
          .getByLabel("Signed amount · GBP", { exact: true })
          .boundingBox();
        expect(field?.width).toBeGreaterThanOrEqual(140);
        if (width === 1280) {
          const note = await page
            .getByRole("heading", { name: "Your private note", exact: true })
            .boundingBox();
          const transfer = await page
            .getByRole("heading", { name: "Link a transfer", exact: true })
            .boundingBox();
          expect(note && transfer && note.y < transfer.y).toBeTruthy();
        }
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
      }
      await page.evaluate(() => {
        document.body.style.zoom = "";
      });
      if (width === 390 || width === 1280)
        await page.screenshot({
          path: `/tmp/joint-ui3-${path.includes("?") ? "list" : "detail"}-${width}.png`,
          fullPage: true,
        });
    }
  });
}

test("extreme signed transaction amount and long description wrap without hiding the detail link", async ({
  page,
}) => {
  await activityWorkspaceFixture(page);
  const transaction = {
    ...firstTransaction,
    description:
      "A deliberately long household transaction description without any shortened source text ".repeat(
        3,
      ),
    money: { amountMinor: "-9223372036854775808", currency: "GBP" },
  };
  await page.route(`**/api/households/${householdId}/transactions**`, (route) =>
    route.fulfill({
      json: new URL(route.request().url()).pathname.endsWith("/transactions")
        ? { items: [transaction], nextCursor: null }
        : transaction,
    }),
  );
  await page.setViewportSize({ width: 320, height: 900 });
  for (const path of [
    `/activity?account=${activityAccount.id}`,
    `/activity/${firstTransaction.id}`,
  ]) {
    await page.goto(path);
    await expect(
      page.getByText("-£92,233,720,368,547,758.08", { exact: true }).first(),
    ).toBeVisible();
    await page.evaluate(() => {
      document.body.style.zoom = "2";
    });
    await expect(
      page.getByText("-£92,233,720,368,547,758.08", { exact: true }).first(),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: transaction.description, exact: true }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    if (path.includes("?")) {
      const link = page.getByRole("link").filter({
        has: page.getByRole("heading", {
          name: transaction.description,
          exact: true,
        }),
      });
      await link.focus();
      await Promise.all([
        page.waitForResponse((response) =>
          response
            .url()
            .endsWith(
              `/api/households/${householdId}/transactions/${firstTransaction.id}`,
            ),
        ),
        page.waitForURL(`**/activity/${firstTransaction.id}`),
        page.keyboard.press("Enter"),
      ]);
      await expect(
        page.getByRole("region", { name: "Transaction source", exact: true }),
      ).toBeVisible();
    }
    await page.evaluate(() => {
      document.body.style.zoom = "";
    });
  }
});
