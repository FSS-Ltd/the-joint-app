import { createFixtureOwner } from "../fixtures/database.js";
import { spawn, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";
import {
  authServerEnvironmentSchema,
  meResponseSchema,
} from "../../packages/contracts/dist/index.js";
import { createApplication } from "../../apps/api/dist/application.js";
import { createDatabase } from "../../packages/database/dist/index.js";
import { createOrm } from "../../packages/database/dist/client.js";
import { createLocalAuthFixture, totp } from "../fixtures/local-auth.js";

const origin = "http://127.0.0.1:3301";
const apiOrigin = "http://127.0.0.1:3302";
type Fixture = ReturnType<typeof createLocalAuthFixture>;
type LocalUser = Awaited<ReturnType<Fixture["createConfirmedUser"]>>;
let auth: Fixture;
let owner: LocalUser;
let member: LocalUser;
let database: ReturnType<typeof createOrm>;
let fixtureOwner: ReturnType<typeof createFixtureOwner>;
let health: ReturnType<typeof createDatabase>;
let application: Awaited<ReturnType<typeof createApplication>>;
let web: ChildProcess | undefined;
const users: string[] = [];
const households: string[] = [];

test.use({ baseURL: origin });
test.describe.configure({ mode: "serial" });

async function waitForWeb(): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (web?.exitCode !== null)
      throw new Error(
        "Isolated identity web server exited before becoming ready",
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
    "Isolated identity web server did not become ready on port 3301",
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

test.beforeAll(async () => {
  const connection =
    process.env.DATABASE_URL ??
    "postgresql://joint:local-development-only@127.0.0.1:5432/joint";
  database = createOrm(connection);
  fixtureOwner = createFixtureOwner();
  health = createDatabase(connection, 500);
  auth = createLocalAuthFixture();
  owner = await auth.createConfirmedUser();
  users.push(owner.session.user.id);
  member = await auth.createConfirmedUser();
  users.push(member.session.user.id);
  application = await createApplication(health, undefined, {
    database,
    environment: authServerEnvironmentSchema.parse(process.env),
  });
  await application.listen(3302, "127.0.0.1");
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
      "3301",
    ],
    {
      cwd: fileURLToPath(new URL("../../apps/web/", import.meta.url)),
      env: { ...process.env, API_BASE_URL: apiOrigin, WEB_ORIGIN: origin },
      stdio: "ignore",
    },
  );
  await waitForWeb();
});

test.afterAll(async () => {
  await stopWeb();
  if (application) await application.close();
  if (database) {
    await fixtureOwner.household.deleteMany({
      where: { id: { in: households } },
    });
    await fixtureOwner.sessionRegistry.deleteMany({
      where: { userId: { in: users } },
    });
    await fixtureOwner.requestKey.deleteMany({
      where: { userId: { in: users } },
    });
    await fixtureOwner.auditEvent.deleteMany({
      where: { userId: { in: users } },
    });
    await fixtureOwner.user.deleteMany({ where: { id: { in: users } } });
    await database.$disconnect();
    await fixtureOwner.$disconnect();
  }
  if (auth) for (const id of users) await auth.deleteUser(id);
  if (health) await health.close();
});

test("auth controls wait for delayed hydration and preserve continuation", async ({
  page,
  context,
}) => {
  const hydrationUser = await auth.createConfirmedUser();
  users.push(hydrationUser.session.user.id);
  for (const mode of ["sign-in", "sign-up", "recovery"] as const) {
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const chunks = (url: URL) =>
      url.pathname.startsWith("/_next/static/") && url.pathname.endsWith(".js");
    await page.route(chunks, async (route) => {
      await gate;
      await route.continue();
    });
    try {
      await page.goto(`${origin}/${mode}?next=join`, { waitUntil: "commit" });
      await expect(page.getByLabel("Email address")).toBeVisible();
      await expect(page.getByLabel("Email address")).toBeDisabled();
      if (mode !== "recovery") {
        await expect(page.getByLabel(/^Password/)).toBeDisabled();
        await expect(
          page.getByRole("button", { name: "Show password", exact: true }),
        ).toBeDisabled();
      }
      await expect(page.locator('form button[type="submit"]')).toBeDisabled();
      release();
      await expect(page.getByLabel("Email address")).toBeEnabled();
      if (mode !== "recovery")
        await expect(
          page.getByRole("button", { name: "Show password", exact: true }),
        ).toBeEnabled();
      await expect(page.locator('form button[type="submit"]')).toBeEnabled();
      if (mode === "sign-in") {
        await page.getByLabel("Email address").fill(hydrationUser.email);
        await page.getByLabel(/^Password/).fill(hydrationUser.password);
        await page
          .getByRole("button", { name: "Sign in", exact: true })
          .click();
        await expect(page).toHaveURL(`${origin}/join`);
        expect((await context.request.get("/api/me")).status()).toBe(200);
      }
    } finally {
      release();
      await page.unrouteAll({ behavior: "wait" });
    }
  }
});

test("real local identity, two-tab refresh, MFA and invitations preserve session boundaries", async ({
  page,
  context,
  browser,
}) => {
  test.setTimeout(90000);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/sign-in");
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("link", { name: "Skip to content" }),
  ).toBeFocused();
  await page.getByLabel("Email address").fill(owner.email);
  await page.getByLabel(/^Password/).fill(owner.password);
  const loginResponse = page.waitForResponse(
    (response) => response.url() === `${origin}/api/auth/login`,
  );
  await page.getByRole("button", { name: "Sign in" }).click();
  expect((await loginResponse).status()).toBe(200);
  await expect(page).toHaveURL(`${origin}/household`);
  await expect(
    page.getByRole("heading", { name: "Name your household" }),
  ).toBeVisible();
  expect(await page.evaluate(() => document.cookie)).not.toContain(
    "joint-session",
  );
  expect(await page.evaluate(() => document.cookie)).not.toContain(
    "joint-csrf",
  );
  expect(
    (await context.cookies()).find((cookie) => cookie.name === "joint-session")
      ?.httpOnly,
  ).toBe(true);
  expect(
    await page.evaluate(() => ({
      local: localStorage.length,
      session: sessionStorage.length,
    })),
  ).toEqual({ local: 0, session: 0 });

  await page.getByLabel("Household name").fill("Our synthetic home");
  await page.getByRole("button", { name: "Create household" }).click();
  await expect(
    page.getByRole("heading", { name: "Your household is ready" }),
  ).toBeVisible();
  const householdMe = meResponseSchema.parse(
    await (await context.request.get("/api/me")).json(),
  );
  if (!householdMe.membership)
    throw new Error("Expected the created household membership");
  households.push(householdMe.membership.householdId);
  const inviteLater = page.getByRole("link", {
    name: "Invite later",
    exact: true,
  });
  await expect(inviteLater).toHaveAttribute("href", "/accounts");
  await inviteLater.focus();
  await expect(inviteLater).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(`${origin}/accounts`);
  await page.reload();
  await expect(page).toHaveURL(`${origin}/accounts`);
  await expect(
    page.getByRole("heading", { name: "Your accounts", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Invite your person" }),
  ).toHaveCount(0);
  await page.goto("/household");
  await expect(
    page.getByRole("heading", { name: "Invite your person" }),
  ).toBeVisible();
  const secondTab = await context.newPage();
  await secondTab.goto("/");
  const sessionCookieBefore = (await context.cookies()).find(
    (cookie) => cookie.name === "joint-session",
  )?.value;
  const activeSessions = await database.sessionRegistry.findMany({
    where: { userId: owner.session.user.id, kind: "WEB", revokedAt: null },
    select: { id: true, providerTokens: true },
  });
  expect(activeSessions.length).toBe(1);
  const activeSession = activeSessions[0];
  if (!activeSession?.providerTokens || !sessionCookieBefore)
    throw new Error("Expected one active opaque owner session");
  await database.sessionRegistry.update({
    where: { id: activeSession.id },
    data: { providerExpiresAt: new Date(0) },
  });
  const refreshStatuses = await Promise.all(
    [page, secondTab].map((tab) =>
      tab.evaluate(async () => {
        const response = await fetch("/api/me", { cache: "no-store" });
        return response.status;
      }),
    ),
  );
  expect(refreshStatuses).toEqual([200, 200]);
  const sessionCookieAfter = (await context.cookies()).find(
    (cookie) => cookie.name === "joint-session",
  )?.value;
  expect(sessionCookieAfter === sessionCookieBefore).toBe(true);
  const refreshedSession = await database.sessionRegistry.findUniqueOrThrow({
    where: { id: activeSession.id },
    select: { providerTokens: true, providerExpiresAt: true },
  });
  expect(refreshedSession.providerTokens !== activeSession.providerTokens).toBe(
    true,
  );
  expect(
    (refreshedSession.providerExpiresAt?.getTime() ?? 0) > Date.now(),
  ).toBe(true);
  await secondTab.goto("/household");
  await expect(
    secondTab.getByRole("heading", { name: "Your household is ready" }),
  ).toBeVisible();

  for (const width of [390, 1280, 320]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth,
      ),
    ).toBe(false);
    if (width !== 320)
      await page.screenshot({
        path: `/tmp/joint-live-household-${width}.png`,
        fullPage: true,
      });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page
    .getByRole("navigation", { name: "App", exact: true })
    .getByText("More", { exact: true })
    .click();
  await page
    .getByRole("navigation", { name: "App", exact: true })
    .getByRole("link", { name: "Security", exact: true })
    .click();
  const enrollmentResponse = page.waitForResponse(
    (response) => response.url() === `${origin}/api/auth/mfa/enroll`,
  );
  await page.getByRole("button", { name: "Set up authenticator" }).click();
  expect((await enrollmentResponse).status()).toBe(200);
  const setupKey = await page.locator(".setup-secret").textContent();
  if (!setupKey)
    throw new Error("Expected a transient authenticator setup key");
  await expect(
    page.getByAltText(
      "Scan this private setup QR code with your authenticator app",
    ),
  ).toBeVisible();
  await page.getByLabel(/^Authenticator code/).fill(totp(setupKey));
  await page.getByRole("button", { name: "Verify code" }).click();
  await expect(page.getByText("Verified for this session")).toBeVisible();
  await expect(page.locator(".setup-secret")).toHaveCount(0);
  const elevated = meResponseSchema.parse(
    await (await context.request.get("/api/me")).json(),
  );
  expect(elevated.session.aal).toBe("aal2");
  await page.screenshot({
    path: "/tmp/joint-live-security-390.png",
    fullPage: true,
  });

  await page
    .getByRole("navigation", { name: "App", exact: true })
    .getByText("More", { exact: true })
    .click();
  await page
    .getByRole("navigation", { name: "App", exact: true })
    .getByRole("link", { name: "Household", exact: true })
    .click();
  await page.getByLabel("Their email address").fill(member.email);
  await page.getByRole("button", { name: "Create invitation link" }).click();
  const invitationLink = await page
    .getByLabel("Private invitation link")
    .inputValue();
  const memberContext = await browser.newContext({
    baseURL: origin,
    viewport: { width: 390, height: 844 },
  });
  try {
    const memberPage = await memberContext.newPage();
    await memberPage.goto(invitationLink);
    await expect(memberPage).toHaveURL(`${origin}/join`);
    await memberPage.getByRole("link", { name: "Sign in to continue" }).click();
    await memberPage.getByLabel("Email address").fill(member.email);
    await memberPage.getByLabel(/^Password/).fill(member.password);
    await memberPage.getByRole("button", { name: "Sign in" }).click();
    await expect(memberPage).toHaveURL(`${origin}/join`);
    await expect(
      memberPage.getByRole("button", { name: "Accept invitation" }),
    ).toBeVisible();
    expect(
      meResponseSchema.parse(
        await (await memberContext.request.get("/api/me")).json(),
      ).membership,
    ).toBeNull();
    expect(await memberPage.evaluate(() => document.cookie)).not.toContain(
      "joint-pending-invite",
    );
    await memberPage.getByRole("button", { name: "Accept invitation" }).click();
    await expect(
      memberPage.getByRole("heading", { name: "You're part of the household" }),
    ).toBeVisible();
    expect(
      meResponseSchema.parse(
        await (await memberContext.request.get("/api/me")).json(),
      ).membership?.role,
    ).toBe("MEMBER");

    await page.getByRole("button", { name: "Sign out", exact: true }).click();
    await expect(page).toHaveURL(`${origin}/sign-in`);
    await expect(secondTab).toHaveURL(`${origin}/sign-in`);
    await expect(
      secondTab.getByRole("heading", { name: "Sign in", exact: true }),
    ).toBeVisible();
    await expect(
      secondTab.getByRole("heading", { name: "Your household is ready" }),
    ).toHaveCount(0);
    await secondTab.close();
    expect((await context.request.get("/api/me")).status()).toBe(401);
    expect(
      (await context.cookies()).some(
        (cookie) => cookie.name === "joint-session",
      ),
    ).toBe(false);
    await page.getByLabel("Email address").fill(owner.email);
    await page.getByLabel(/^Password/).fill(owner.password);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL(`${origin}/security`);
    await expect(page.getByLabel(/^Authenticator code/)).toBeVisible();
    // A new TOTP period avoids reusing the enrollment code.
    await page.waitForTimeout(30000 - (Date.now() % 30000) + 250);
    await page.getByLabel(/^Authenticator code/).fill(totp(setupKey));
    await page.getByRole("button", { name: "Verify code" }).click();
    await expect(page).toHaveURL(`${origin}/household`);
    await page.getByRole("button", { name: "Sign out on all devices" }).click();
    await expect(page).toHaveURL(`${origin}/sign-in`);
    expect((await context.request.get("/api/me")).status()).toBe(401);
    expect((await memberContext.request.get("/api/me")).status()).toBe(200);
  } finally {
    await memberContext.close();
  }
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.evaluate(() => {
    document.body.style.zoom = "2";
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    ),
  ).toBe(false);
  expect(
    await page.evaluate(() => ({
      local: localStorage.length,
      session: sessionStorage.length,
    })),
  ).toEqual({ local: 0, session: 0 });
});
