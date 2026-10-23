import { expect, test } from "@playwright/test";
import {
  accountSchema,
  exportStatusSchema,
  meResponseSchema,
} from "../../packages/contracts/dist/index.js";
import { totp } from "../fixtures/local-auth.js";
import {
  capture,
  database,
  households,
  origin,
  privacyUsers,
  signIn,
  startPrivacyBrowser,
  stopPrivacyBrowser,
} from "../fixtures/privacy-browser.js";
import { progressPrivacyJob } from "../fixtures/privacy-jobs.js";

test.use({ baseURL: origin, actionTimeout: 15000 });
test.describe.configure({ mode: "serial" });
test.beforeAll(startPrivacyBrowser);
test.afterAll(stopPrivacyBrowser);
test("two adults import, budget, downgrade, export, leave and regain an owner-only archive", async ({
  page,
  context,
  browser,
}) => {
  test.setTimeout(180000);
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page, privacyUsers().owner);
  await page.getByLabel("Household name").fill("Synthetic privacy household");
  await page.getByRole("button", { name: "Create household" }).click();
  await expect(
    page.getByRole("heading", { name: "Your household is ready" }),
  ).toBeVisible();
  const me = meResponseSchema.parse(
    await (await context.request.get("/api/me")).json(),
  );
  if (!me.membership) throw new Error("Expected household");
  const h = me.membership.householdId;
  households.push(h);
  const base = `/api/households/${h}`;
  async function mutate(
    path: string,
    body: object,
    method = "POST",
    version?: number,
  ) {
    const csrf = (await (
      await context.request.get("/api/auth/csrf")
    ).json()) as { csrfToken: string };
    const response = await context.request.fetch(path, {
      method,
      headers: {
        Origin: origin,
        "X-CSRF-Token": csrf.csrfToken,
        "Idempotency-Key": crypto.randomUUID(),
        ...(version === undefined ? {} : { "If-Match": `"${version}"` }),
      },
      data: body,
    });
    expect(response.status(), await response.text()).toBe(200);
    return response.json() as Promise<unknown>;
  }
  await page.goto(`${origin}/security?next=accounts`);
  await page.getByRole("button", { name: "Set up authenticator" }).click();
  const secret = await page.locator(".setup-secret").textContent();
  if (!secret) throw new Error("Expected authenticator key");
  await page.getByLabel(/^Authenticator code/).fill(totp(secret));
  await page.getByRole("button", { name: "Verify code" }).click();
  await expect(page).toHaveURL(`${origin}/accounts`);
  const account = accountSchema.parse(
    await mutate(`${base}/accounts`, {
      label: "Synthetic archive account",
      kind: "CURRENT",
      currency: "GBP",
      liquidity: "AVAILABLE",
    }),
  );
  const partner = await browser.newContext({
    baseURL: origin,
    viewport: { width: 390, height: 844 },
  });
  try {
    const other = await partner.newPage();
    await page.goto(`${origin}/household`);
    await page
      .getByLabel("Their email address")
      .fill(privacyUsers().member.email);
    await page.getByRole("button", { name: "Create invitation link" }).click();
    await other.goto(
      await page.getByLabel("Private invitation link").inputValue(),
    );
    await other.getByRole("link", { name: "Sign in to continue" }).click();
    await other.getByLabel("Email address").fill(privacyUsers().member.email);
    await other.getByLabel(/^Password/).fill(privacyUsers().member.password);
    await other.getByRole("button", { name: "Sign in" }).click();
    await other.getByRole("button", { name: "Accept invitation" }).click();
    await expect(
      other.getByRole("heading", { name: "You're part of the household" }),
    ).toBeVisible();
    await page.goto(`${origin}/accounts/${account.id}`);
    await page.getByLabel("Other adult's access").selectOption("TRANSACTIONS");
    await page.getByRole("button", { name: "Save sharing" }).click();
    await expect(page.getByText("Sharing preference saved.")).toBeVisible();
    const partnerMe = meResponseSchema.parse(
      await (await partner.request.get("/api/me")).json(),
    );
    if (!partnerMe.membership) throw new Error("Expected partner membership");
    await database.account.create({
      data: {
        householdId: h,
        creatorUserId: partnerMe.user.id,
        creatorMembershipId: partnerMe.membership.id,
        kind: "SAVINGS",
        label: "Synthetic former partner account",
        owners: {
          create: {
            userId: partnerMe.user.id,
            membershipId: partnerMe.membership.id,
          },
        },
      },
    });
    await other.goto(`${origin}/settings/privacy`);
    await other
      .getByRole("checkbox", { name: /Synthetic archive account/ })
      .check();
    await page.getByLabel("Other adult's access").selectOption("TOTALS");
    await page.getByRole("button", { name: "Save sharing" }).click();
    await expect(page.getByText("Sharing preference saved.")).toBeVisible();
    await other.evaluate(() => window.dispatchEvent(new Event("focus")));
    await expect(
      other.getByRole("checkbox", {
        name: /Synthetic archive account.*Values only/,
      }),
    ).not.toBeChecked();
    await expect(
      other.getByRole("button", { name: "Request CSV export" }),
    ).toBeDisabled();
    await page.goto(`${origin}/imports?account=${account.id}`);
    await page.getByLabel("CSV file", { exact: true }).setInputFiles({
      name: "synthetic.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(
        "Date,Description,Amount\n2026-01-01,Synthetic privacy groceries,-12.34\n",
      ),
    });
    await page.getByRole("button", { name: "Inspect columns" }).click();
    for (const [label, value] of [
      ["Date column", "0"],
      ["Description column", "1"],
      ["Date format", "ISO"],
      ["Decimal separator", "DOT"],
      ["Amount columns", "SIGNED"],
      ["Amount column", "2"],
      ["Positive amounts mean", "INFLOW"],
    ] as const)
      await page
        .getByRole("combobox", { name: label, exact: true })
        .selectOption(value);
    await page.getByRole("button", { name: "Create preview" }).click();
    await expect(page).toHaveURL(/\/imports\/[0-9a-f-]+\?account=/);
    const batch = new URL(page.url()).pathname.split("/").at(-1);
    if (!batch) throw new Error("Expected batch");
    await progressPrivacyJob(h, batch);
    await expect(
      page.getByRole("heading", { name: "Ready for review" }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Commit import", exact: true })
      .click();
    await expect
      .poll(
        async () =>
          (
            await database.job.findMany({
              where: { householdId: h, resourceId: batch, state: "QUEUED" },
            })
          ).length,
      )
      .toBeGreaterThan(0);
    await progressPrivacyJob(h, batch);
    await expect(
      page.getByRole("heading", { name: "Imported", exact: true }),
    ).toBeVisible();
    await page.goto(`${origin}/budgets?month=2026-01`);
    await page.getByLabel("Category", { exact: true }).fill("Groceries");
    await page.getByLabel("Monthly limit · GBP").fill("100.00");
    await page.getByRole("button", { name: "Save monthly budget" }).click();
    await expect
      .poll(
        async () =>
          await database.budgetLine.count({
            where: { budget: { householdId: h } },
          }),
      )
      .toBe(1);
    const grant = await database.entitlementGrant.create({
      data: {
        householdId: h,
        membershipId: me.membership.id,
        userId: me.user.id,
        issuer: "Synthetic browser operator",
        reason: "Synthetic bounded trial",
        capabilities: ["connections.bank"],
        issuedAt: new Date(),
        expiresAt: new Date(Date.now() + 3600000),
      },
    });
    await page.goto(`${origin}/settings/privacy`);
    await expect(
      page.getByRole("heading", { name: "Plus access" }),
    ).toBeVisible();
    await database.entitlementGrant.update({
      where: { id: grant.id },
      data: { revokedAt: new Date() },
    });
    await page.reload();
    await expect(
      page.getByRole("heading", { name: "Free essentials" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Disconnect bank · unavailable" }),
    ).toBeDisabled();
    await page
      .getByRole("checkbox", { name: /Synthetic archive account/ })
      .check();
    const realNow = Date.now;
    // Age the API's clock for one authenticated request; provider proof stays genuine.
    try {
      Date.now = () => realNow() + 360_000;
      const expired = page.waitForResponse(
        (result) =>
          result.url() === `${origin}${base}/exports` &&
          result.request().method() === "POST",
      );
      await page.getByRole("button", { name: "Request CSV export" }).click();
      expect((await expired).status()).toBe(403);
    } finally {
      Date.now = realNow;
    }
    await expect(
      page.getByRole("link", { name: "Verify a fresh authenticator code" }),
    ).toHaveAttribute("href", "/security?next=privacy&reauth=1");
    await page
      .getByRole("link", { name: "Verify a fresh authenticator code" })
      .click();
    await page.getByLabel(/^Authenticator code/).fill(totp(secret));
    await page.getByRole("button", { name: "Verify code" }).click();
    await expect(page).toHaveURL(`${origin}/settings/privacy`);
    await page
      .getByRole("checkbox", { name: /Synthetic archive account/ })
      .check();
    let releaseInitialPost: () => void = () => {};
    const initialPostGate = new Promise<void>((resolve) => {
      releaseInitialPost = resolve;
    });
    let initialPostAccepted: () => void = () => {};
    const initialPostReady = new Promise<void>((resolve) => {
      initialPostAccepted = resolve;
    });
    await page.route(`${origin}${base}/exports`, async (route) => {
      if (route.request().method() !== "POST") {
        await route.continue();
        return;
      }
      const response = await route.fetch();
      expect(response.status()).toBe(202);
      initialPostAccepted();
      await initialPostGate;
      await route.fulfill({ response });
    });
    const queued = page.waitForResponse(
      (result) =>
        result.url() === `${origin}${base}/exports` &&
        result.request().method() === "POST",
    );
    await page.getByRole("button", { name: "Request CSV export" }).click();
    await initialPostReady;
    const refreshedDuringPost = page.waitForResponse(
      (result) => result.url() === `${origin}${base}/accounts?limit=50`,
    );
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await refreshedDuringPost;
    await expect(
      page.getByRole("checkbox", { name: /Synthetic archive account/ }),
    ).not.toBeChecked();
    releaseInitialPost();
    const job = exportStatusSchema.parse(await (await queued).json());
    await page.unroute(`${origin}${base}/exports`);
    let additionalExportPosts = 0;
    const countExportPost = (request: import("@playwright/test").Request) => {
      if (
        request.url() === `${origin}${base}/exports` &&
        request.method() === "POST"
      )
        additionalExportPosts++;
    };
    page.on("request", countExportPost);
    const resumedStatus = page.waitForResponse(
      (result) => result.url() === `${origin}${base}/exports/${job.id}`,
    );
    await other.bringToFront();
    await page.bringToFront();
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    const resumed = exportStatusSchema.parse(
      await (await resumedStatus).json(),
    );
    expect(resumed.id).toBe(job.id);
    expect(resumed.state).toBe("QUEUED");
    await expect(
      page.getByRole("checkbox", { name: /Synthetic archive account/ }),
    ).not.toBeChecked();
    await progressPrivacyJob(h, job.id);
    try {
      Date.now = () => realNow() + 360_000;
      const expiredStatus = await context.request.get(
        `${base}/exports/${job.id}`,
      );
      expect(expiredStatus.status()).toBe(200);
      expect(
        exportStatusSchema.safeParse(await expiredStatus.json()).success,
      ).toBe(true);
      const expiredDownload = await context.request.get(
        `${base}/exports/${job.id}/download`,
        { maxRedirects: 0 },
      );
      expect(expiredDownload.status()).toBe(303);
      expect(expiredDownload.headers().location).toBe(
        "/settings/privacy?export=mfa",
      );
    } finally {
      Date.now = realNow;
    }

    await expect(
      page.getByRole("link", { name: "Download CSV" }),
    ).toBeVisible();
    expect(additionalExportPosts).toBe(0);
    page.off("request", countExportPost);
    const download = page.waitForEvent("download");
    await page.getByRole("link", { name: "Download CSV" }).click();
    const file = await download;
    expect(await file.failure()).toBeNull();
    const stream = await file.createReadStream();
    if (!stream) throw new Error("Expected export stream");
    let csv = "";
    for await (const chunk of stream) csv += String(chunk);
    expect(csv).toContain("Synthetic privacy groceries");
    expect(csv).toContain("-1234");
    await page.keyboard.press("Tab");
    await expect(page.locator(":focus")).toBeVisible();
    await capture(page, "privacy");
    await page
      .getByRole("button", { name: "Leave household", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Confirm and leave household" }),
    ).toBeDisabled();
    await page
      .getByRole("checkbox", { name: /I understand these consequences/ })
      .check();
    await page
      .getByRole("button", { name: "Confirm and leave household" })
      .click();
    await expect(page).toHaveURL(`${origin}/sign-in?next=archive`);
    expect((await context.request.get(`${base}/accounts`)).status()).toBe(401);
    await page.getByLabel("Email address").fill(privacyUsers().owner.email);
    await page.getByLabel(/^Password/).fill(privacyUsers().owner.password);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL(`${origin}/security?next=archive`);
    await page.getByLabel(/^Authenticator code/).fill(totp(secret));
    await page.getByRole("button", { name: "Verify code" }).click();
    await expect(page).toHaveURL(`${origin}/archive`);
    await expect(
      page.getByRole("heading", { name: "Your owner archive." }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: /Synthetic archive account · Read history/ })
      .click();
    await expect(
      page.getByText("Synthetic privacy groceries", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Record transaction" }),
    ).toHaveCount(0);
    await capture(page, "archive");
    await page.goto(`${origin}/household`);
    await page.getByLabel("Household name").fill("Synthetic new household");
    await page.getByRole("button", { name: "Create household" }).click();
    await expect(
      page.getByRole("heading", { name: "Your household is ready" }),
    ).toBeVisible();
    const newMe = meResponseSchema.parse(
      await (await context.request.get("/api/me")).json(),
    );
    if (!newMe.membership) throw new Error("Expected new household");
    households.push(newMe.membership.householdId);
    await page.goto(`${origin}/archive`);
    await page
      .getByRole("button", { name: /Synthetic archive account · Read history/ })
      .click();
    await expect(
      page.getByText("Synthetic privacy groceries", { exact: true }),
    ).toBeVisible();
    await page
      .getByRole("checkbox", { name: /Synthetic archive account/ })
      .check();
    const archivedExport = page.waitForResponse(
      (result) =>
        result.url() === `${origin}/api/me/archive/exports` &&
        result.request().method() === "POST",
    );
    await page.getByRole("button", { name: "Request CSV export" }).click();
    const archiveJob = exportStatusSchema.parse(
      await (await archivedExport).json(),
    );
    await progressPrivacyJob(h, archiveJob.id);
    await expect(
      page.getByRole("button", { name: /Synthetic former partner account/ }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("checkbox", { name: /Synthetic former partner account/ }),
    ).toHaveCount(0);

    await expect(
      page.getByRole("link", { name: "Download CSV" }),
    ).toBeVisible();

    await other.goto(`${origin}/accounts`);
    await expect(
      other.getByText("Synthetic archive account", { exact: true }),
    ).toHaveCount(0);
    await page.goto(`${origin}/settings/privacy`);
    await page
      .getByRole("button", { name: "Delete my account", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Confirm and delete my account" }),
    ).toBeDisabled();
    await page
      .getByRole("checkbox", { name: /I understand these consequences/ })
      .check();
    await page
      .getByRole("button", { name: "Confirm and delete my account" })
      .click();
    await expect(page).toHaveURL(/\/privacy\/deletion\?id=[0-9a-f-]+$/);
    await expect(
      page.getByText(
        "Your deletion request is being processed. App access has ended.",
      ),
    ).toBeVisible();
    const receiptCookie = (await context.cookies()).find(
      (cookie) => cookie.name === "joint-deletion-receipt",
    );
    expect(receiptCookie).toMatchObject({
      httpOnly: true,
      path: "/api/privacy",
      sameSite: "Strict",
    });
    expect(
      (await context.cookies()).some(
        (cookie) => cookie.name === "joint-session",
      ),
    ).toBe(false);
    expect(page.url()).not.toContain(
      receiptCookie?.value.split(".")[1] ?? "missing receipt",
    );
    await capture(page, "deletion-receipt");
  } finally {
    await partner.close();
  }
});
