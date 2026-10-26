import { expect, test, type Route } from "@playwright/test";
import type {
  ExportStatus,
  DeletionStatus,
} from "../../packages/contracts/dist/index.js";
import {
  importBatch,
  importState,
  importWorkspaceFixture,
} from "../fixtures/import-workspace.js";
import { householdId } from "../fixtures/account-workspace.js";
import { privacyWorkspaceFixture } from "../fixtures/privacy-workspace.js";
import {
  emitStatusSignal,
  installStatusSignals,
  statusSignalCounts,
} from "../fixtures/status-signals.js";

test.use({ serviceWorkers: "block" });
test.afterEach(async ({ page }, info) => {
  if (page && !page.isClosed() && info.status !== info.expectedStatus)
    await info.attach("synthetic-status-lifecycle", {
      body: JSON.stringify(await statusSignalCounts(page)),
      contentType: "application/json",
    });
});
const importPath = `/api/households/${householdId}/imports/${importBatch.id}`;

test("queued imports make zero idle status reads and catch up on a committed signal", async ({
  page,
}) => {
  const fixture = await importWorkspaceFixture(page);
  fixture.setBatch(importState("QUEUED"));
  let reads = 0;
  page.on("request", (request) => {
    if (
      new URL(request.url()).pathname === importPath &&
      request.method() === "GET"
    )
      reads++;
  });
  await page.goto(`/imports/${importBatch.id}`);
  await expect(
    page.getByRole("heading", { name: "Queued", exact: true }),
  ).toBeVisible();
  const baseline = reads;
  // Measure absence of requests across the former1s polling interval.
  await page.waitForTimeout(2600);
  expect(reads).toBe(baseline);
  fixture.setBatch(importState("READY"));
  await emitStatusSignal(page, "change");
  await expect(
    page.getByRole("heading", { name: "Ready for review", exact: true }),
  ).toBeVisible();
  await emitStatusSignal(page, "invalidate");
  await expect(
    page.getByRole("region", { name: "Import overview", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("region", { name: "Source row review", exact: true }),
  ).toHaveCount(0);
});

test("unchanged import signals preserve a draft and new versions reset it", async ({
  page,
}) => {
  const fixture = await importWorkspaceFixture(page);
  let reads = 0;
  page.on("request", (request) => {
    if (
      new URL(request.url()).pathname === importPath &&
      request.method() === "GET"
    )
      reads++;
  });
  await page.goto(`/imports/${importBatch.id}`);
  const keep = page
    .getByRole("group", { name: "Decision for row 2", exact: true })
    .getByRole("radio", { name: "Keep", exact: true });
  await keep.check();
  await expect(
    page.getByRole("button", { name: "Refresh import status", exact: true }),
  ).toBeDisabled();
  const before = reads;
  await emitStatusSignal(page, "change");
  await expect.poll(() => reads).toBeGreaterThan(before);
  await expect(keep).toBeChecked();
  fixture.setBatch({ ...importState("READY"), version: 2 });
  await emitStatusSignal(page, "change");
  await expect(keep).not.toBeChecked();
  await expect(
    page.getByRole("button", { name: "Refresh import status", exact: true }),
  ).toBeEnabled();
});

for (const archive of [false, true])
  test(`${archive ? "archive" : "household"} exports update from signals without idle reads and hide revoked downloads`, async ({
    page,
  }) => {
    await privacyWorkspaceFixture(page);
    const path = archive
      ? "/api/me/archive/exports"
      : `/api/households/${householdId}/exports`;
    let job: ExportStatus = {
      id: "77777777-7777-4777-8777-777777777777",
      state: "QUEUED",
      createdAt: "2026-10-25T12:00:00.000Z",
      expiresAt: "2099-01-01T00:00:00.000Z",
      downloadExpiresAt: null,
    };
    let reads = 0;
    await page.route(`**${path}**`, (route) => {
      if (route.request().method() === "GET") reads++;
      return route.fulfill({ json: job });
    });
    await page.goto(archive ? "/archive" : "/settings/privacy");
    await page.getByRole("checkbox", { name: /Everyday account/ }).check();
    await page
      .getByRole("button", { name: "Request CSV export", exact: true })
      .click();
    await expect(
      page.getByText("Your export is queued.", { exact: true }),
    ).toBeVisible();
    const baseline = reads;
    // Measure absence of requests across the former2s polling interval.
    await page.waitForTimeout(2600);
    expect(reads).toBe(baseline);
    job = {
      ...job,
      state: "READY",
      downloadExpiresAt: "2099-01-01T00:00:00.000Z",
    };
    await emitStatusSignal(page, "change");
    const download = page.getByRole("link", {
      name: "Download CSV",
      exact: true,
    });
    await expect(download).toBeVisible();
    await emitStatusSignal(page, "invalidate");
    await expect(download).toHaveCount(0);
  });

test("deletion receipts have no idle polling and completed receipts clear on expiry", async ({
  page,
}) => {
  await installStatusSignals(page);
  const id = "99999999-9999-4999-8999-999999999999";
  let status: DeletionStatus = {
    id,
    state: "PENDING",
    requestedAt: "2026-10-25T12:00:00.000Z",
    completedAt: null,
  };
  let reads = 0;
  await page.route(`**/api/privacy/deletion-requests/${id}`, (route) => {
    reads++;
    return route.fulfill({ json: status });
  });
  await page.goto(`/privacy/deletion?id=${id}`);
  await expect(
    page.getByText(
      "Your deletion request is being processed. App access has ended.",
      { exact: true },
    ),
  ).toBeVisible();
  const baseline = reads;
  // Measure absence of requests across the former5s polling interval.
  await page.waitForTimeout(5300);
  expect(reads).toBe(baseline);
  status = {
    ...status,
    state: "COMPLETED",
    completedAt: "2026-10-25T12:01:00.000Z",
  };
  await emitStatusSignal(page, "change");
  await expect(
    page.getByText("Deletion completed.", { exact: true }),
  ).toBeVisible();
  await emitStatusSignal(page, "invalidate");
  await expect(
    page.getByText("Deletion completed.", { exact: true }),
  ).toHaveCount(0);
});

test("terminal import data clears offline and reconciles on restoration", async ({
  page,
}) => {
  const fixture = await importWorkspaceFixture(page);
  fixture.setBatch(importState("COMMITTED"));
  await page.goto(`/imports/${importBatch.id}`);
  await expect(
    page.getByRole("heading", { name: "Imported", exact: true }),
  ).toBeVisible();
  await page.evaluate(() => window.dispatchEvent(new Event("offline")));
  await expect(
    page.getByRole("region", { name: "Import overview", exact: true }),
  ).toHaveCount(0);
  fixture.setBatch(importState("ROLLED_BACK"));
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await expect(
    page.getByRole("heading", { name: "Rolled back", exact: true }),
  ).toBeVisible();
});

test("opaque import draft survives reconnect but is discarded after revocation", async ({
  page,
}) => {
  await importWorkspaceFixture(page);
  await page.goto(`/imports/${importBatch.id}`);
  const keep = page
    .getByRole("group", { name: "Decision for row 2", exact: true })
    .getByRole("radio", { name: "Keep", exact: true });
  await keep.check();
  await page.evaluate(() => window.dispatchEvent(new Event("offline")));
  await expect(
    page.getByRole("region", { name: "Source row review", exact: true }),
  ).toHaveCount(0);
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await expect(keep).toBeChecked();
  await expect(
    page.getByRole("button", { name: "Refresh import status", exact: true }),
  ).toBeDisabled();
  await emitStatusSignal(page, "invalidate");
  await expect(
    page.getByRole("region", { name: "Source row review", exact: true }),
  ).toHaveCount(0);
  // A subsequent explicit retry represents restored authority in this synthetic fixture.
  await page
    .getByRole("button", { name: "Retry import status", exact: true })
    .click();
  await expect(keep).not.toBeChecked();
});

test("transient import errors keep actionable feedback and explicit retry", async ({
  page,
}) => {
  const fixture = await importWorkspaceFixture(page);
  let reads = 0;
  page.on("request", (request) => {
    if (new URL(request.url()).pathname === importPath) reads++;
  });
  await page.goto(`/imports/${importBatch.id}`);
  await expect(
    page.getByRole("heading", { name: "Ready for review", exact: true }),
  ).toBeVisible();
  const baseline = reads;
  const beforeSignals = (await statusSignalCounts(page))?.signals ?? 0;
  fixture.fail(true);
  await emitStatusSignal(page, "change");
  await expect
    .poll(async () => (await statusSignalCounts(page))?.signals ?? 0)
    .toBeGreaterThan(beforeSignals);
  await expect.poll(() => reads).toBeGreaterThan(baseline);
  await expect(
    page.getByText("Import temporarily unavailable.", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Import overview", exact: true }),
  ).toHaveCount(0);
  fixture.fail(false);
  await page
    .getByRole("button", { name: "Retry import status", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Ready for review", exact: true }),
  ).toBeVisible();
});

test("late review mutation responses cannot restore revoked import data", async ({
  page,
}) => {
  await importWorkspaceFixture(page);
  let resolveHeld: ((route: Route) => void) | undefined;
  const captured = new Promise<Route>((resolve) => {
    resolveHeld = resolve;
  });
  await page.route(`**${importPath}/review`, (route) => {
    resolveHeld?.(route);
  });
  await page.goto(`/imports/${importBatch.id}`);
  await page
    .getByRole("group", { name: "Decision for row 2", exact: true })
    .getByRole("radio", { name: "Keep", exact: true })
    .check();
  await page
    .getByRole("button", { name: "Save row choices", exact: true })
    .click();
  const held = await captured;
  await emitStatusSignal(page, "invalidate");
  const overview = page.getByRole("region", {
    name: "Import overview",
    exact: true,
  });
  await expect(overview).toHaveCount(0);
  const response = page.waitForResponse(
    (result) =>
      result.url().endsWith(`${importPath}/review`) &&
      result.request().method() === "PATCH",
  );
  await held.fulfill({ json: { ...importState("READY"), version: 2 } });
  await (await response).finished();
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
  await expect(overview).toHaveCount(0);
});

test("revalidated source rows keep opaque choices and disable writes until reads recover", async ({
  page,
}) => {
  await importWorkspaceFixture(page);
  let failedRows = false;
  await page.route(`**${importPath}/rows?*`, (route) =>
    failedRows
      ? route.fulfill({
          status: 503,
          json: {
            error: {
              code: "UNAVAILABLE",
              message: "Source rows temporarily unavailable.",
            },
          },
        })
      : route.fallback(),
  );
  await page.goto(`/imports/${importBatch.id}`);
  const keep = page
    .getByRole("group", { name: "Decision for row 2", exact: true })
    .getByRole("radio", { name: "Keep", exact: true });
  await keep.check();
  await page.evaluate(() => window.dispatchEvent(new Event("offline")));
  await expect(
    page.getByRole("region", { name: "Source row review", exact: true }),
  ).toHaveCount(0);
  await expect
    .poll(async () => {
      const value = await statusSignalCounts(page);
      return value ? value.opened - value.closed : -1;
    })
    .toBe(0);
  failedRows = true;
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await expect(
    page.getByText("Source rows temporarily unavailable.", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Save row choices", exact: true }),
  ).toBeDisabled();
  failedRows = false;
  await page.getByRole("button", { name: "Reload rows", exact: true }).click();
  await expect(keep).toBeChecked();
  await expect(
    page.getByRole("button", { name: "Save row choices", exact: true }),
  ).toBeEnabled();
});

test("transient activity failure preserves opaque import choices within the live session deadline", async ({
  page,
}) => {
  await importWorkspaceFixture(page);
  await page.route("**/api/auth/session", (route) =>
    route.request().method() === "POST"
      ? route.fulfill({
          status: 503,
          json: { error: { message: "Synthetic activity outage" } },
        })
      : route.fallback(),
  );
  await page.goto(`/imports/${importBatch.id}`);
  const keep = page
    .getByRole("group", { name: "Decision for row 2", exact: true })
    .getByRole("radio", { name: "Keep", exact: true });
  const activity = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === "/api/auth/session" &&
      response.request().method() === "POST",
  );
  await keep.check();
  expect((await activity).status()).toBe(503);
  await page.waitForTimeout(150);
  await expect(keep).toBeChecked();
  await expect(
    page.getByRole("button", { name: "Retry session check" }),
  ).toHaveCount(0);
});

test("successful activity reconciliation in a hidden tab retains its opaque import draft", async ({
  page,
}) => {
  await importWorkspaceFixture(page);
  await page.goto(`/imports/${importBatch.id}`);
  const keep = page
    .getByRole("group", { name: "Decision for row 2", exact: true })
    .getByRole("radio", { name: "Keep", exact: true });
  await keep.check();
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => "hidden",
    });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  const checked = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === "/api/auth/session" &&
      response.request().method() === "GET",
  );
  await page.evaluate(() => {
    const channel = new BroadcastChannel("joint-session-activity");
    channel.postMessage("ACTIVITY_COMMITTED");
    channel.close();
  });
  expect((await checked).status()).toBe(200);
  await page.waitForTimeout(150);
  await expect(page.locator("#main")).toHaveCount(1);
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => "visible",
    });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect(keep).toBeChecked();
});
