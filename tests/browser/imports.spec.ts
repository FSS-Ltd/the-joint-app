import { randomBytes } from "node:crypto";
import { spawn, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { fileURLToPath } from "node:url";
import { expect, test, type Page } from "@playwright/test";
import {
  authServerEnvironmentSchema,
  meResponseSchema,
  importBatchSchema,
  transactionListSchema,
} from "../../packages/contracts/dist/index.js";
import { createApplication } from "../../apps/api/dist/application.js";
import { createDatabase } from "../../packages/database/dist/index.js";
import { createOrm } from "../../packages/database/dist/client.js";
import { JobsRepository } from "../../packages/database/dist/jobs.repository.js";
import { createImportHandlers } from "../../apps/worker/src/imports/handlers.js";
import { createLocalAuthFixture, totp } from "../fixtures/local-auth.js";

const importKey = randomBytes(32).toString("base64");
const handlers = createImportHandlers(importKey);
const origin = "http://127.0.0.1:3501";
type Fixture = ReturnType<typeof createLocalAuthFixture>;
type LocalUser = Awaited<ReturnType<Fixture["createConfirmedUser"]>>;
let auth: Fixture;
let owner: LocalUser;
let member: LocalUser;
let database: ReturnType<typeof createOrm>;
let runtime: ReturnType<typeof createOrm>;
let health: ReturnType<typeof createDatabase>;
let application: Awaited<ReturnType<typeof createApplication>>;
let web: ChildProcess | undefined;
const users: string[] = [];
const households: string[] = [];

test.use({ baseURL: origin, actionTimeout: 15000 });
test.describe.configure({ mode: "serial" });
async function waitForWeb(): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (web?.exitCode !== null)
      throw new Error(
        "Isolated imports web server exited before becoming ready",
      );
    try {
      if ((await fetch(origin, { signal: AbortSignal.timeout(500) })).ok)
        return;
    } catch {
      /* The owned local server may still be starting. */
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(
    "Isolated imports web server did not become ready on port 3501",
  );
}
async function stopWeb(): Promise<void> {
  if (!web || web.exitCode !== null) return;
  const exited = once(web, "exit");
  web.kill("SIGTERM");
  const force = setTimeout(() => web?.kill("SIGKILL"), 5000);
  try {
    await exited;
  } finally {
    clearTimeout(force);
  }
}
async function signIn(page: Page, user: LocalUser): Promise<void> {
  await page.goto(`${origin}/sign-in`);
  await page.getByLabel("Email address").fill(user.email);
  await page.getByLabel(/^Password/).fill(user.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(`${origin}/household`);
}
async function expectMutation(
  page: Page,
  path: string,
  method: string,
  action: () => Promise<unknown>,
): Promise<void> {
  const response = page.waitForResponse(
    (result) =>
      result.url() === `${origin}${path}` &&
      result.request().method() === method,
  );
  await action();
  expect((await response).status()).toBe(200);
}
test.beforeAll(async () => {
  if (!process.env.DATABASE_URL || !process.env.MIGRATION_DATABASE_URL)
    throw new Error(
      "Imports browser integration requires local runtime and migration-owner database settings",
    );
  database = createOrm(process.env.MIGRATION_DATABASE_URL);
  runtime = createOrm(process.env.DATABASE_URL);
  health = createDatabase(process.env.DATABASE_URL, 500);
  auth = createLocalAuthFixture();
  owner = await auth.createConfirmedUser();
  users.push(owner.session.user.id);
  member = await auth.createConfirmedUser();
  users.push(member.session.user.id);
  application = await createApplication(health, undefined, {
    database: runtime,
    environment: authServerEnvironmentSchema.parse(process.env),
    importKey,
  });
  await application.listen(3502, "127.0.0.1");
  web = spawn(
    process.execPath,
    [
      fileURLToPath(
        new URL(
          "../../apps/web/node_modules/next/dist/bin/next",
          import.meta.url,
        ),
      ),
      "start",
      "--hostname",
      "127.0.0.1",
      "--port",
      "3501",
    ],
    {
      cwd: fileURLToPath(new URL("../../apps/web/", import.meta.url)),
      env: {
        ...process.env,
        API_BASE_URL: "http://127.0.0.1:3502",
        WEB_ORIGIN: origin,
      },
      stdio: "ignore",
    },
  );
  await waitForWeb();
});
test.afterAll(async () => {
  await stopWeb();
  if (application) await application.close();
  if (runtime) await runtime.$disconnect();
  if (database) {
    await database.account.deleteMany({
      where: { householdId: { in: households } },
    });
    await database.household.deleteMany({ where: { id: { in: households } } });
    await database.sessionRegistry.deleteMany({
      where: { userId: { in: users } },
    });
    await database.requestKey.deleteMany({ where: { userId: { in: users } } });
    await database.auditEvent.deleteMany({ where: { userId: { in: users } } });
    await database.user.deleteMany({ where: { id: { in: users } } });
    await database.$disconnect();
  }
  if (auth) for (const id of users) await auth.deleteUser(id);
  if (health) await health.close();
});

async function progress(householdId: string, batchId: string): Promise<void> {
  const jobs = new JobsRepository(runtime);
  for (let attempt = 0; attempt < 10; attempt++) {
    const job = await runtime.job.findFirst({
      where: { householdId, resourceId: batchId, state: "QUEUED" },
      orderBy: { createdAt: "asc" },
    });
    if (!job) return;
    const lease = await jobs.claim(
      `browser-import-${householdId}`,
      Object.keys(handlers),
      5000,
      job.id,
    );
    if (!lease) throw new Error("Expected this fixture's queued lease");
    const handler = handlers[lease.type];
    if (!handler) throw new Error("Unexpected import worker type");
    expect(await jobs.complete(lease, (tx) => handler(lease, tx), 5000)).toBe(
      true,
    );
  }
  throw new Error("Import exceeded its bounded fixture jobs");
}
async function inspectAndPreview(
  page: Page,
  csv: string,
  accountId: string,
  householdId: string,
  options: { ready?: boolean; captureMapping?: boolean } = {},
): Promise<string> {
  await page.goto(`${origin}/imports?account=${accountId}`);
  await page.getByLabel("CSV file", { exact: true }).setInputFiles({
    name: "synthetic.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(csv),
  });
  await expectMutation(
    page,
    `/api/households/${householdId}/imports/inspect`,
    "POST",
    () => page.getByRole("button", { name: "Inspect columns" }).click(),
  );
  await page
    .getByRole("combobox", { name: "Date column", exact: true })
    .selectOption("0");
  await page
    .getByRole("combobox", { name: "Description column", exact: true })
    .selectOption("1");
  await page
    .getByRole("combobox", { name: "Date format", exact: true })
    .selectOption("ISO");
  await page
    .getByRole("combobox", { name: "Decimal separator", exact: true })
    .selectOption("DOT");
  await page
    .getByRole("combobox", { name: "Amount columns", exact: true })
    .selectOption("SIGNED");
  await page
    .getByRole("combobox", { name: "Amount column", exact: true })
    .selectOption("2");
  await page
    .getByRole("combobox", { name: "Positive amounts mean", exact: true })
    .selectOption("INFLOW");
  if (options.captureMapping) await capture(page, "import-mapping");
  await expectMutation(
    page,
    `/api/households/${householdId}/imports/preview`,
    "POST",
    () => page.getByRole("button", { name: "Create preview" }).click(),
  );
  await expect(page).toHaveURL(
    new RegExp(`${origin}/imports/[0-9a-f-]+\\?account=`),
  );
  const id = new URL(page.url()).pathname.split("/").at(-1);
  if (!id) throw new Error("Expected batch id");
  await progress(householdId, id);
  if (options.ready !== false)
    await expect(
      page.getByRole("heading", { name: "Ready for review" }),
    ).toBeVisible();
  return id;
}
async function commit(
  page: Page,
  householdId: string,
  id: string,
): Promise<void> {
  await expectMutation(
    page,
    `/api/households/${householdId}/imports/${id}/commit`,
    "POST",
    () =>
      page.getByRole("button", { name: "Commit import", exact: true }).click(),
  );
  await progress(householdId, id);
  await expect(
    page.getByRole("heading", { name: "Imported", exact: true }),
  ).toBeVisible();
}
async function capture(page: Page, name: string): Promise<void> {
  for (const width of [390, 1280, 320]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth,
      ),
    ).toBe(false);
    await page.evaluate(() => {
      if (document.activeElement instanceof HTMLElement)
        document.activeElement.blur();
      window.scrollTo(0, 0);
    });
    if (width !== 320)
      await page.screenshot({
        path: `/tmp/joint-live-${name}-${width}.png`,
        fullPage: true,
      });
  }
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.evaluate(() => {
    document.body.style.zoom = "2";
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    ),
  ).toBe(false);
  await page.evaluate(() => {
    document.body.style.zoom = "";
  });
  await page.setViewportSize({ width: 390, height: 844 });
}

test("real CSV review, replay, overlap choices, private notes, corrections and reversible imports", async ({
  page,
  context,
  browser,
}) => {
  test.setTimeout(120000);
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page, owner);
  await page.getByLabel("Household name").fill("Synthetic import household");
  await expectMutation(page, "/api/households", "POST", () =>
    page.getByRole("button", { name: "Create household" }).click(),
  );
  const me = meResponseSchema.parse(
    await (await context.request.get("/api/me")).json(),
  );
  if (!me.membership) throw new Error("Expected owner membership");
  const householdId = me.membership.householdId;
  households.push(householdId);
  await page.goto(`${origin}/security?next=accounts`);
  await expectMutation(page, "/api/auth/mfa/enroll", "POST", () =>
    page.getByRole("button", { name: "Set up authenticator" }).click(),
  );
  const secret = await page.locator(".setup-secret").textContent();
  if (!secret) throw new Error("Expected setup key");
  await page.getByLabel(/^Authenticator code/).fill(totp(secret));
  await page.getByRole("button", { name: "Verify code" }).click();
  await expect(page).toHaveURL(`${origin}/accounts`);
  await page.locator(".account-create > summary").click();
  await page
    .getByLabel("Account name", { exact: true })
    .fill("Synthetic everyday account");
  await page.getByLabel("Account type").selectOption("CURRENT");
  await expectMutation(
    page,
    `/api/households/${householdId}/accounts`,
    "POST",
    () => page.getByRole("button", { name: "Create private account" }).click(),
  );
  await expect(
    page.getByRole("heading", { name: "Synthetic everyday account", level: 1 }),
  ).toBeVisible();
  const accountId = new URL(page.url()).pathname.split("/").at(-1);
  if (!accountId) throw new Error("Expected account id");
  const base = `/api/households/${householdId}`;
  const csv =
    'Date,Description,Amount\n2026-01-01,"Café, books\nand more",-12.34\n2026-01-01,"Café, books\nand more",-12.34\nnot-a-date,Rejected purchase,-2.00\n';
  const batchId = await inspectAndPreview(page, csv, accountId, householdId, {
    captureMapping: true,
  });
  await expect(
    page.getByText("Café, books and more", { exact: true }),
  ).toHaveCount(2);
  await expect(
    page.getByRole("button", { name: "Commit import", exact: true }),
  ).toBeDisabled();
  await page.getByLabel(/I understand that 1 rejected row/).check();
  await capture(page, "import-review");
  await commit(page, householdId, batchId);
  const ledger = async () =>
    transactionListSchema.parse(
      await (
        await context.request.get(`${base}/transactions?accountId=${accountId}`)
      ).json(),
    ).items;
  const initialEntries = await ledger();
  expect(initialEntries).toHaveLength(2);
  // Identical bytes replay the original batch and never make another transaction.
  const replayId = await inspectAndPreview(page, csv, accountId, householdId, {
    ready: false,
  });
  expect(replayId).toBe(batchId);
  expect(await ledger()).toHaveLength(2);
  // A different file with equal financial rows requires explicit Keep / Skip.
  const overlapId = await inspectAndPreview(
    page,
    'Date,Description,Amount\n2026-01-01,"Café, books\nand more",-12.34\n2026-01-01,"Café, books\nand more",-12.34\n',
    accountId,
    householdId,
  );
  await page
    .getByRole("group", { name: "Decision for row 1", exact: true })
    .getByLabel("Keep", { exact: true })
    .check();
  await page
    .getByRole("group", { name: "Decision for row 2", exact: true })
    .getByLabel("Skip", { exact: true })
    .check();
  await expect(
    page.getByRole("button", { name: "Commit import", exact: true }),
  ).toBeDisabled();
  await expectMutation(
    page,
    `${base}/imports/${overlapId}/review`,
    "PATCH",
    () => page.getByRole("button", { name: "Save row choices" }).click(),
  );
  await commit(page, householdId, overlapId);
  expect(await ledger()).toHaveLength(3);

  await page.getByRole("link", { name: "View account activity" }).click();
  await page.getByLabel("Booked date", { exact: true }).fill("2026-01-02");
  await page
    .getByLabel("Description", { exact: true })
    .fill("Synthetic manual lunch");
  await page.getByLabel("Amount (GBP)", { exact: true }).fill("-8.50");
  await expectMutation(page, `${base}/transactions`, "POST", () =>
    page.getByRole("button", { name: "Record transaction" }).click(),
  );
  await expect(
    page.getByRole("link", { name: /Synthetic manual lunch/ }),
  ).toBeVisible();
  await capture(page, "activity");
  await page.getByRole("link", { name: /Synthetic manual lunch/ }).click();
  await page
    .getByLabel("Description", { exact: true })
    .fill("Corrected synthetic lunch");
  await page.getByLabel("Amount (GBP)", { exact: true }).fill("-9.00");
  const manualId = new URL(page.url()).pathname.split("/").at(-1);
  await expectMutation(page, `${base}/transactions/${manualId}`, "PATCH", () =>
    page.getByRole("button", { name: "Save correction" }).click(),
  );
  const classification = page.locator("section").filter({
    has: page.getByRole("heading", { name: "Classification", exact: true }),
  });
  await classification.getByLabel("Category", { exact: true }).fill("Food");
  await page.getByLabel("Merchant", { exact: true }).fill("Synthetic café");
  await expectMutation(
    page,
    `${base}/transactions/${manualId}/annotation`,
    "PATCH",
    () => page.getByRole("button", { name: "Save classification" }).click(),
  );
  await expectMutation(
    page,
    `${base}/transactions/${manualId}/annotation`,
    "PATCH",
    () =>
      page
        .getByRole("button", { name: "Undo last classification change" })
        .click(),
  );
  await expect(
    classification.getByLabel("Category", { exact: true }),
  ).toHaveValue("");
  await page
    .getByRole("textbox", { name: "Private note", exact: true })
    .fill("Owner-only synthetic reminder");
  await expectMutation(
    page,
    `${base}/transactions/${manualId}/annotation`,
    "PATCH",
    () => page.getByRole("button", { name: "Save private note" }).click(),
  );
  await capture(page, "transaction-detail");

  // Add the other adult through the actual invitation flow, then grant details.
  const memberContext = await browser.newContext({
    baseURL: origin,
    viewport: { width: 390, height: 844 },
  });
  try {
    const memberPage = await memberContext.newPage();
    await page.goto(`${origin}/household`);
    await page.getByLabel("Their email address").fill(member.email);
    await page.getByRole("button", { name: "Create invitation link" }).click();
    const invitation = await page
      .getByLabel("Private invitation link")
      .inputValue();
    await memberPage.goto(invitation);
    await memberPage.getByRole("link", { name: "Sign in to continue" }).click();
    await memberPage.getByLabel("Email address").fill(member.email);
    await memberPage.getByLabel(/^Password/).fill(member.password);
    await memberPage.getByRole("button", { name: "Sign in" }).click();
    await memberPage.getByRole("button", { name: "Accept invitation" }).click();
    await expect(
      memberPage.getByRole("heading", { name: "You're part of the household" }),
    ).toBeVisible();
    await page.goto(`${origin}/accounts/${accountId}`);
    await page.getByLabel("Other adult's access").selectOption("TRANSACTIONS");
    await page.getByRole("button", { name: "Save sharing" }).click();
    await expect(page.getByText("Sharing preference saved.")).toBeVisible();
    await memberPage.goto(`${origin}/activity/${manualId}`);
    await expect(
      memberPage.getByRole("heading", {
        name: "Corrected synthetic lunch",
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      memberPage.getByRole("textbox", { name: "Private note", exact: true }),
    ).toHaveValue("");
    await expect(
      memberPage.getByRole("button", { name: "Save correction" }),
    ).toHaveCount(0);
    await expect(
      memberPage.getByRole("button", { name: "Save classification" }),
    ).toHaveCount(0);
    await memberPage
      .getByRole("textbox", { name: "Private note", exact: true })
      .fill("Partner-only synthetic reminder");
    await memberPage.getByRole("button", { name: "Save private note" }).click();
    await expect(
      memberPage.getByText("Your private note was saved."),
    ).toBeVisible();
    await page.goto(`${origin}/activity/${manualId}`);
    await expect(
      page.getByRole("textbox", { name: "Private note", exact: true }),
    ).toHaveValue("Owner-only synthetic reminder");
  } finally {
    await memberContext.close();
  }
  // Notes protect a CSV batch from rollback.
  const imported = initialEntries[0];
  if (!imported) throw new Error("Expected CSV entry");
  await page.goto(`${origin}/activity/${imported.id}`);
  await page
    .getByRole("textbox", { name: "Private note", exact: true })
    .fill("Synthetic protected lineage");
  await page.getByRole("button", { name: "Save private note" }).click();
  await expect(page.getByText("Your private note was saved.")).toBeVisible();
  await page.goto(`${origin}/imports/${batchId}`);
  await expect(
    page.getByText("Later changes or notes protect this import from rollback."),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Roll back import", exact: true }),
  ).toHaveCount(0);
  const protectedBatch = importBatchSchema.parse(
    await (await context.request.get(`${base}/imports/${batchId}`)).json(),
  );
  const deniedStatus = await page.evaluate(
    async ({ path, version }) => {
      const csrfResponse: { csrfToken: string } = await (
        await fetch("/api/auth/csrf", { cache: "no-store" })
      ).json();
      return (
        await fetch(path, {
          method: "DELETE",
          headers: {
            "X-CSRF-Token": csrfResponse.csrfToken,
            "If-Match": `"${version}"`,
          },
        })
      ).status;
    },
    { path: `${base}/imports/${batchId}`, version: protectedBatch.version },
  );
  expect(deniedStatus).toBe(409);
  // Unmodified batch rollback/restore uses the exact same transaction identity.
  const cleanId = await inspectAndPreview(
    page,
    "Date,Description,Amount\n2026-01-03,Synthetic clean purchase,-3.25\n2026-01-03,Synthetic skipped purchase,-1.00\n",
    accountId,
    householdId,
  );
  await page
    .getByRole("group", { name: "Decision for row 2", exact: true })
    .getByLabel("Skip", { exact: true })
    .check();
  await expectMutation(page, `${base}/imports/${cleanId}/review`, "PATCH", () =>
    page.getByRole("button", { name: "Save row choices" }).click(),
  );
  await commit(page, householdId, cleanId);
  expect(
    (await ledger()).some(
      (item) => item.description === "Synthetic skipped purchase",
    ),
  ).toBe(false);
  const before = (await ledger()).find(
    (item) => item.description === "Synthetic clean purchase",
  );
  if (!before) throw new Error("Expected clean transaction");
  await page
    .getByRole("button", { name: "Roll back import", exact: true })
    .click();
  await expectMutation(page, `${base}/imports/${cleanId}`, "DELETE", () =>
    page.getByRole("button", { name: "Confirm rollback" }).click(),
  );
  expect((await ledger()).some((item) => item.id === before.id)).toBe(false);
  await expectMutation(page, `${base}/imports/${cleanId}/commit`, "POST", () =>
    page.getByRole("button", { name: "Restore import", exact: true }).click(),
  );
  await progress(householdId, cleanId);
  await expect(
    page.getByRole("heading", { name: "Imported", exact: true }),
  ).toBeVisible();
  expect((await ledger()).some((item) => item.id === before.id)).toBe(true);
  await page.getByRole("button", { name: "Delete original CSV now" }).click();
  await expectMutation(
    page,
    `${base}/imports/${cleanId}/original`,
    "DELETE",
    () =>
      page.getByRole("button", { name: "Delete original permanently" }).click(),
  );
  const deleted = importBatchSchema.parse(
    await (await context.request.get(`${base}/imports/${cleanId}`)).json(),
  );
  expect(deleted.originalAvailable).toBe(false);
  expect((await ledger()).some((item) => item.id === before.id)).toBe(true);
  const pagedCsv = `Date,Description,Amount\n${Array.from({ length: 101 }, (_, index) => `2026-01-04,Synthetic page row ${index + 1},-1.00`).join("\n")}\n`;
  await inspectAndPreview(page, pagedCsv, accountId, householdId);
  await expect(page.getByRole("listitem")).toHaveCount(100);
  await page
    .getByRole("button", { name: "Next 100 rows", exact: true })
    .click();
  await expect(page.getByRole("listitem")).toHaveCount(1);
  await expect(
    page.getByRole("heading", { name: "Synthetic page row 101", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("combobox", { name: "Show rows", exact: true })
    .selectOption("REVIEW");
  await expect(page.getByText("No rows in this view.")).toBeVisible();
  await page.reload();
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("link", { name: "Skip to content" }),
  ).toBeFocused();
  expect(
    await page.evaluate(() => ({
      local: localStorage.length,
      session: sessionStorage.length,
    })),
  ).toEqual({ local: 0, session: 0 });
});
