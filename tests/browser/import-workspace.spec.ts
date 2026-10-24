import { expect, test } from "@playwright/test";
import {
  importAccount,
  importBatch,
  importState,
  importWorkspaceFixture,
} from "../fixtures/import-workspace.js";
test.use({ serviceWorkers: "block" });
const detailPath = `/imports/${importBatch.id}`;

test("CSV overview distinguishes source, valid, rejected, overlap, duplicate and committed counts", async ({
  page,
}) => {
  await importWorkspaceFixture(page);
  await page.goto(detailPath);
  const summary = page.getByRole("region", {
    name: "Import overview",
    exact: true,
  });
  await expect(
    summary.getByRole("heading", { name: "Ready for review", exact: true }),
  ).toBeVisible();
  for (const [label, value] of Object.entries({
    "Source rows": "4",
    "Valid rows": "3",
    "Rejected rows": "1",
    "Possible overlaps": "1",
    "Duplicate rows": "1",
    "Committed transactions": "0",
  })) {
    const metric = summary
      .locator("dl > div")
      .filter({ has: page.getByText(label, { exact: true }) });
    await expect(metric.locator("dd")).toHaveText(value);
  }
  await expect(summary.getByText(/Valid rows may still need/)).toBeVisible();
  await expect(
    page.getByRole("group", { name: "Decision for row 3", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByText("The date does not match the chosen format.", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Rejected row", exact: true }),
  ).toHaveCSS("color", "rgb(156, 56, 56)");
  await expect(page.getByText("+£100.00", { exact: true })).toBeVisible();
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.screenshot({
    path: "/tmp/joint-ui4-overview-1280.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: "/tmp/joint-ui4-overview-390.png",
    fullPage: true,
  });
});

test("overlap choices preserve dirty guards and rejected-row acknowledgement", async ({
  page,
}) => {
  const fixture = await importWorkspaceFixture(page);
  await page.goto(detailPath);
  const commit = page.getByRole("button", {
    name: "Commit import",
    exact: true,
  });
  const acknowledgement = page.getByRole("checkbox", {
    name: /I understand that 1 rejected row/,
  });
  await expect(commit).toBeDisabled();
  await acknowledgement.focus();
  await acknowledgement.press("Space");
  await expect(commit).toBeEnabled();
  await page
    .getByRole("group", { name: "Decision for row 2", exact: true })
    .getByRole("radio", { name: "Keep", exact: true })
    .check();
  await expect(commit).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Refresh import status", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("combobox", { name: "Show rows", exact: true }),
  ).toBeDisabled();
  await Promise.all([
    page.waitForResponse((response) =>
      new URL(response.url()).pathname.endsWith(
        `/imports/${importBatch.id}/review`,
      ),
    ),
    page.waitForResponse((response) =>
      new URL(response.url()).pathname.endsWith(
        `/imports/${importBatch.id}/rows`,
      ),
    ),
    page.getByRole("button", { name: "Save row choices", exact: true }).click(),
  ]);
  await expect(acknowledgement).not.toBeChecked();
  await expect(commit).toBeDisabled();
  await acknowledgement.check();
  await expect(commit).toBeEnabled();
  expect(fixture.writes.some((value) => value.endsWith("/review"))).toBe(true);
  await expect(
    page.getByRole("radio", { name: "Keep", exact: true }).nth(1),
  ).toBeChecked();
});

test("CSV selection and explicit mapping retain inspect, map and review steps", async ({
  page,
}) => {
  await importWorkspaceFixture(page);
  await page.goto(`/imports?account=${importAccount.id}`);
  const steps = page.getByRole("list", {
    name: "CSV import steps",
    exact: true,
  });
  await expect(steps.getByText("Inspect", { exact: true })).toHaveAttribute(
    "aria-current",
    "step",
  );
  await page.getByLabel("CSV file", { exact: true }).setInputFiles({
    name: "synthetic.csv",
    mimeType: "text/csv",
    buffer: Buffer.from("Date,Description,Amount\n2026-10-22,Sample,-12.00"),
  });
  await page
    .getByRole("button", { name: "Inspect columns", exact: true })
    .click();
  await expect(steps.getByText("Map", { exact: true })).toHaveAttribute(
    "aria-current",
    "step",
  );
  for (const [name, value] of Object.entries({
    "Date column": "0",
    "Description column": "1",
    "Date format": "ISO",
    "Decimal separator": "DOT",
    "Amount columns": "SIGNED",
    "Amount column": "2",
    "Positive amounts mean": "INFLOW",
  }))
    await page.getByRole("combobox", { name, exact: true }).selectOption(value);
  const preview = page.getByRole("button", {
    name: "Create preview",
    exact: true,
  });
  await preview.focus();
  await Promise.all([
    page.waitForResponse((response) =>
      new URL(response.url()).pathname.endsWith(`/imports/${importBatch.id}`),
    ),
    page.waitForURL(
      (url) =>
        url.pathname === detailPath &&
        url.searchParams.get("account") === importAccount.id,
    ),
    preview.press("Enter"),
  ]);
  await expect(
    page.getByRole("heading", { name: "Ready for review", exact: true }),
  ).toBeVisible();
});

test("history paging states loaded batches and offers explicit retry", async ({
  page,
}) => {
  const fixture = await importWorkspaceFixture(page);
  await page.goto(`/imports?account=${importAccount.id}`);
  const history = page.getByRole("region", {
    name: "Import history",
    exact: true,
  });
  await expect(
    history.getByText("1 import loaded", { exact: true }),
  ).toBeVisible();
  await history
    .getByRole("button", { name: "Load more imports", exact: true })
    .click();
  await expect(
    history.getByText("2 imports loaded", { exact: true }),
  ).toBeVisible();
  fixture.fail(true);
  await history
    .getByRole("button", { name: "Refresh imports", exact: true })
    .click();
  await expect(history.getByRole("alert")).toBeVisible();
  fixture.fail(false);
  await history
    .getByRole("button", { name: "Refresh imports", exact: true })
    .click();
  await expect(
    history.getByRole("link", { name: "Ready for review", exact: true }),
  ).toBeVisible();
});

for (const state of [
  "COMMITTED",
  "ROLLED_BACK",
  "FAILED",
  "EXPIRED",
] as const) {
  test(`import ${state} keeps state-specific controls and source warnings`, async ({
    page,
  }) => {
    const fixture = await importWorkspaceFixture(page);
    fixture.setBatch(importState(state));
    await page.goto(detailPath);
    const summary = page.getByRole("region", {
      name: "Import overview",
      exact: true,
    });
    await expect(summary).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Commit import", exact: true }),
    ).toHaveCount(0);
    await expect(page.getByRole("radio")).toHaveCount(0);
    if (state === "COMMITTED") {
      await expect(summary.getByText(/2 transactions imported/)).toBeVisible();
      await page
        .getByRole("button", { name: "Roll back import", exact: true })
        .click();
      await expect(
        page.getByRole("button", { name: "Confirm rollback", exact: true }),
      ).toBeVisible();
      await page.getByRole("button", { name: "Cancel", exact: true }).click();
    }
    if (state === "ROLLED_BACK")
      await expect(
        page.getByRole("button", { name: "Restore import", exact: true }),
      ).toBeDisabled();
    if (state === "FAILED")
      await expect(summary.getByRole("alert")).toBeVisible();
    if (state === "EXPIRED")
      await expect(summary.getByText(/preview has expired/)).toBeVisible();
    await page
      .getByRole("button", { name: "Delete original CSV now", exact: true })
      .click();
    await expect(
      page.getByRole("button", {
        name: "Delete original permanently",
        exact: true,
      }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    expect(fixture.writes).toEqual([]);
  });
}
