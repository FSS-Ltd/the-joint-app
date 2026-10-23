import { spawn, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { fileURLToPath } from "node:url";
import {
  expect,
  test,
  type APIRequestContext,
  type Page,
} from "@playwright/test";
import {
  accountSchema,
  authServerEnvironmentSchema,
  meResponseSchema,
} from "../../packages/contracts/dist/index.js";
import { createApplication } from "../../apps/api/dist/application.js";
import { createDatabase } from "../../packages/database/dist/index.js";
import { createOrm } from "../../packages/database/dist/client.js";
import { createLocalAuthFixture, totp } from "../fixtures/local-auth.js";

const origin = "http://127.0.0.1:3401";
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
        "Isolated accounts web server exited before becoming ready",
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
    "Isolated accounts web server did not become ready on port 3401",
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
async function csrfToken(request: APIRequestContext): Promise<string> {
  const value: unknown = await (
    await request.get(`${origin}/api/auth/csrf`)
  ).json();
  if (
    typeof value !== "object" ||
    value === null ||
    !("csrfToken" in value) ||
    typeof value.csrfToken !== "string"
  )
    throw new Error("Expected a CSRF token");
  return value.csrfToken;
}

test.beforeAll(async () => {
  if (!process.env.DATABASE_URL || !process.env.MIGRATION_DATABASE_URL)
    throw new Error(
      "Accounts browser integration requires local runtime and migration-owner database settings",
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
  });
  await application.listen(3402, "127.0.0.1");
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
      "3401",
    ],
    {
      cwd: fileURLToPath(new URL("../../apps/web/", import.meta.url)),
      env: {
        ...process.env,
        API_BASE_URL: "http://127.0.0.1:3402",
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

test("real private accounts, dated values, owner grants, fresh MFA and immediate downgrades", async ({
  page,
  context,
  browser,
}) => {
  test.setTimeout(120000);
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page, owner);
  await page.getByLabel("Household name").fill("Synthetic account household");
  await expectMutation(page, "/api/households", "POST", () =>
    page.getByRole("button", { name: "Create household" }).click(),
  );
  await expect(
    page.getByRole("heading", { name: "Your household is ready" }),
  ).toBeVisible();
  const ownerMe = meResponseSchema.parse(
    await (await context.request.get("/api/me")).json(),
  );
  if (!ownerMe.membership)
    throw new Error("Expected the owner household membership");
  const householdId = ownerMe.membership.householdId;
  households.push(householdId);
  const memberContext = await browser.newContext({
    baseURL: origin,
    viewport: { width: 390, height: 844 },
  });
  try {
    const memberPage = await memberContext.newPage();
    await page.getByRole("link", { name: "Accounts", exact: true }).click();
    await expect(
      page.getByRole("link", { name: "Verify your account" }),
    ).toBeVisible();
    await page.getByRole("link", { name: "Verify your account" }).click();
    await expectMutation(page, "/api/auth/mfa/enroll", "POST", () =>
      page.getByRole("button", { name: "Set up authenticator" }).click(),
    );
    const secret = await page.locator(".setup-secret").textContent();
    if (!secret)
      throw new Error("Expected a transient authenticator setup key");
    await page.getByLabel(/^Authenticator code/).fill(totp(secret));
    await page.getByRole("button", { name: "Verify code" }).click();
    await expect(page).toHaveURL(`${origin}/accounts`);
    await page.locator(".account-create > summary").click();
    await page
      .getByLabel("Account name", { exact: true })
      .fill("Synthetic rainy-day account");
    await page.getByLabel("Account type").selectOption("SAVINGS");
    await expectMutation(
      page,
      `/api/households/${householdId}/accounts`,
      "POST",
      () =>
        page.getByRole("button", { name: "Create private account" }).click(),
    );
    await expect(
      page.getByRole("heading", {
        name: "Synthetic rainy-day account",
        level: 1,
      }),
    ).toBeVisible();
    const accountId = new URL(page.url()).pathname.split("/").at(-1);
    if (!accountId) throw new Error("Expected the created account URL");
    const path = `/api/households/${householdId}/accounts/${accountId}`;
    await expect(page.getByText("No value yet", { exact: true })).toBeVisible();
    await page
      .getByRole("link", { name: "Manage household invitations" })
      .click();
    await page.getByLabel("Their email address").fill(member.email);
    await page.getByRole("button", { name: "Create invitation link" }).click();
    const invite = await page
      .getByLabel("Private invitation link")
      .inputValue();
    await memberPage.goto(invite);
    await memberPage.getByRole("link", { name: "Sign in to continue" }).click();
    await memberPage.getByLabel("Email address").fill(member.email);
    await memberPage.getByLabel(/^Password/).fill(member.password);
    await memberPage.getByRole("button", { name: "Sign in" }).click();
    await memberPage.getByRole("button", { name: "Accept invitation" }).click();
    await expect(
      memberPage.getByRole("heading", { name: "You're part of the household" }),
    ).toBeVisible();
    const memberMe = meResponseSchema.parse(
      await (await memberContext.request.get("/api/me")).json(),
    );
    if (!memberMe.membership)
      throw new Error("Expected the second adult's membership");

    await page.goto(`${origin}/accounts/${accountId}`);
    await expect(page.getByText("No value yet", { exact: true })).toBeVisible();

    await memberPage.goto(`${origin}/accounts`);
    await expect(memberPage.getByText(/No accounts to show yet/)).toBeVisible();
    await expect(
      memberPage.getByText("Synthetic rainy-day account", { exact: true }),
    ).toHaveCount(0);
    expect((await memberContext.request.get(path)).status()).toBe(404);

    await page.getByLabel(/^Value \(GBP\)/).fill("1234.56");
    await page.getByLabel("As-of date").fill("2026-10-23");
    await expectMutation(page, `${path}/valuations`, "POST", () =>
      page.getByRole("button", { name: "Record value" }).click(),
    );
    await expect(page.getByText("Manual value recorded.")).toBeVisible();
    await expect(page.getByText("£1,234.56", { exact: true })).toBeVisible();
    await expect(page.getByText(/As of 23 Oct 2026/)).toBeVisible();
    await page
      .getByLabel("Account name", { exact: true })
      .fill("My synthetic savings");
    await page
      .getByRole("combobox", { name: "Availability", exact: true })
      .selectOption("RESTRICTED");
    await expectMutation(page, path, "PATCH", () =>
      page.getByRole("button", { name: "Save settings" }).click(),
    );
    await expect(
      page.getByRole("heading", { name: "My synthetic savings", level: 1 }),
    ).toBeVisible();
    const valued = accountSchema.parse(
      await (await context.request.get(path)).json(),
    );
    expect(valued.latestValuation?.money).toEqual({
      amountMinor: "123456",
      currency: "GBP",
    });
    expect(valued.latestValuation?.source).toBe("MANUAL");
    expect(valued.liquidity).toBe("RESTRICTED");
    for (const width of [390, 1280, 320]) {
      await page.setViewportSize({ width, height: 900 });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth > window.innerWidth,
        ),
      ).toBe(false);
      if (width !== 320) {
        await page.evaluate(() => {
          if (document.activeElement instanceof HTMLElement)
            document.activeElement.blur();
          window.scrollTo(0, 0);
        });
        await page.screenshot({
          path: `/tmp/joint-live-account-detail-${width}.png`,
          fullPage: true,
        });
      }
    }

    await page.getByRole("link", { name: "Back to accounts" }).click();
    await expect(
      page.getByRole("link", { name: "My synthetic savings", exact: true }),
    ).toBeVisible();
    for (const width of [390, 1280, 320]) {
      await page.setViewportSize({ width, height: 900 });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth > window.innerWidth,
        ),
      ).toBe(false);
      if (width !== 320) {
        await page.evaluate(() => {
          if (document.activeElement instanceof HTMLElement)
            document.activeElement.blur();
          window.scrollTo(0, 0);
        });
        await page.screenshot({
          path: `/tmp/joint-live-accounts-${width}.png`,
          fullPage: true,
        });
      }
    }
    await page.reload();
    await page.keyboard.press("Tab");
    await expect(
      page.getByRole("link", { name: "Skip to content" }),
    ).toBeFocused();
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
    await page
      .getByRole("link", { name: "My synthetic savings", exact: true })
      .click();
    await page.getByLabel("Other adult's access").selectOption("TOTALS");
    await expectMutation(
      page,
      `${path}/grants/${memberMe.membership.id}`,
      "PUT",
      () => page.getByRole("button", { name: "Save sharing" }).click(),
    );
    await expect(page.getByText("Sharing preference saved.")).toBeVisible();
    await memberPage.reload();
    await memberPage
      .getByRole("link", { name: "My synthetic savings", exact: true })
      .click();
    await expect(
      memberPage.getByText("£1,234.56", { exact: true }),
    ).toBeVisible();
    await expect(
      memberPage.getByRole("button", { name: "Record value" }),
    ).toHaveCount(0);
    await expect(
      memberPage.getByRole("button", { name: "Save sharing" }),
    ).toHaveCount(0);
    const viewer = accountSchema.parse(
      await (await memberContext.request.get(path)).json(),
    );
    expect(viewer.access).toBe("TOTALS");
    expect(viewer.permissions).toEqual({
      canEdit: false,
      canValue: false,
      canShare: false,
    });
    const headers = {
      Origin: origin,
      "X-CSRF-Token": await csrfToken(memberContext.request),
      "If-Match": `"${viewer.version}"`,
    };
    expect(
      [403, 404].includes(
        (
          await memberContext.request.patch(path, {
            headers,
            data: { label: "Unauthorized edit", liquidity: "LOCKED" },
          })
        ).status(),
      ),
    ).toBe(true);
    expect(
      [403, 404].includes(
        (
          await memberContext.request.put(
            `${path}/grants/${memberMe.membership.id}`,
            {
              headers: { ...headers, "If-Match": '"0"' },
              data: { level: "TRANSACTIONS" },
            },
          )
        ).status(),
      ),
    ).toBe(true);

    // Explicit reauthentication must work even when this session is already AAL2.
    await page.goto(`${origin}/security?reauth=1&next=accounts`);
    await expect(page.getByLabel(/^Authenticator code/)).toBeVisible();
    await page.waitForTimeout(30000 - (Date.now() % 30000) + 250);
    await page.getByLabel(/^Authenticator code/).fill(totp(secret));
    await page.getByRole("button", { name: "Verify code" }).click();
    await expect(page).toHaveURL(`${origin}/accounts`);
    await page
      .getByRole("link", { name: "My synthetic savings", exact: true })
      .click();
    await page.getByLabel("Other adult's access").selectOption("TRANSACTIONS");
    await expectMutation(
      page,
      `${path}/grants/${memberMe.membership.id}`,
      "PUT",
      () => page.getByRole("button", { name: "Save sharing" }).click(),
    );
    await expect(page.getByText("Sharing preference saved.")).toBeVisible();
    expect(
      accountSchema.parse(await (await memberContext.request.get(path)).json())
        .access,
    ).toBe("TRANSACTIONS");
    await page.getByLabel("Other adult's access").selectOption("TOTALS");
    await expectMutation(
      page,
      `${path}/grants/${memberMe.membership.id}`,
      "PUT",
      () => page.getByRole("button", { name: "Save sharing" }).click(),
    );
    await expect(page.getByText("Sharing preference saved.")).toBeVisible();
    expect(
      accountSchema.parse(await (await memberContext.request.get(path)).json())
        .access,
    ).toBe("TOTALS");
    await page.getByLabel("Other adult's access").selectOption("NONE");
    await expectMutation(
      page,
      `${path}/grants/${memberMe.membership.id}`,
      "PUT",
      () => page.getByRole("button", { name: "Save sharing" }).click(),
    );
    await expect(page.getByText("Sharing preference saved.")).toBeVisible();
    expect((await memberContext.request.get(path)).status()).toBe(404);
    await memberPage.reload();
    await expect(
      memberPage.getByText("£1,234.56", { exact: true }),
    ).toHaveCount(0);
    await memberPage
      .getByRole("link", { name: "Accounts", exact: true })
      .click();
    await expect(memberPage.getByText(/No accounts to show yet/)).toBeVisible();
    expect(
      await page.evaluate(() => ({
        local: localStorage.length,
        session: sessionStorage.length,
      })),
    ).toEqual({ local: 0, session: 0 });
    expect(await page.evaluate(() => document.cookie)).not.toContain(
      "joint-session",
    );
  } finally {
    await memberContext.close();
  }
});
