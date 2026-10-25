import { mkdtemp, chmod, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { spawn, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { fileURLToPath } from "node:url";
import { expect, type Page } from "@playwright/test";
import { authServerEnvironmentSchema } from "../../packages/contracts/dist/index.js";
import { createApplication } from "../../apps/api/dist/application.js";
import { createDatabase } from "../../packages/database/dist/index.js";
import { createOrm } from "../../packages/database/dist/client.js";
import { createDatabaseNotifications } from "../../packages/database/dist/notifications.js";
import { StatusEventHub } from "../../apps/api/dist/modules/events/status-hub.js";
import { createLocalAuthFixture } from "./local-auth.js";

export const importKey = randomBytes(32).toString("base64");
export const origin = "http://127.0.0.1:3701";
export const statusOrigin = "http://127.0.0.1:3771";
let activeOrigin = origin;
type Fixture = ReturnType<typeof createLocalAuthFixture>;
type LocalUser = Awaited<ReturnType<Fixture["createConfirmedUser"]>>;
let auth: Fixture;
let owner: LocalUser;
let member: LocalUser;
export let database: ReturnType<typeof createOrm>;
export let runtime: ReturnType<typeof createOrm>;
let health: ReturnType<typeof createDatabase>;
let application: Awaited<ReturnType<typeof createApplication>>;
let web: ChildProcess | undefined;
let journalDirectory: string | undefined;
const users: string[] = [];
export const households: string[] = [];
export function privacyUsers() {
  return { owner, member };
}

async function waitForWeb(): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (web?.exitCode !== null)
      throw new Error(
        "Isolated privacy web server exited before becoming ready",
      );
    try {
      if ((await fetch(activeOrigin, { signal: AbortSignal.timeout(500) })).ok)
        return;
    } catch {
      /* The owned local server may still be starting. */
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("Isolated privacy web server did not become ready");
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
export async function signIn(page: Page, user: LocalUser): Promise<void> {
  await page.goto(`${activeOrigin}/sign-in`);
  await page.getByLabel("Email address").fill(user.email);
  await page.getByLabel(/^Password/).fill(user.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(`${activeOrigin}/household`);
}
export async function expectMutation(
  page: Page,
  path: string,
  method: string,
  action: () => Promise<unknown>,
): Promise<void> {
  const response = page.waitForResponse(
    (result) =>
      result.url() === `${activeOrigin}${path}` &&
      result.request().method() === method,
  );
  await action();
  expect((await response).status()).toBe(200);
}
export async function startPrivacyBrowser(): Promise<void> {
  return startPrivacyBrowserInstance(false);
}
export async function startStatusBrowser(): Promise<void> {
  return startPrivacyBrowserInstance(true);
}
async function startPrivacyBrowserInstance(withEvents: boolean): Promise<void> {
  if (!process.env.DATABASE_URL || !process.env.MIGRATION_DATABASE_URL)
    throw new Error(
      "Privacy browser integration requires local runtime and migration-owner database settings",
    );
  activeOrigin = withEvents ? statusOrigin : origin;
  const webPort = new URL(activeOrigin).port;
  const apiPort = withEvents ? 3772 : 3702;
  database = createOrm(process.env.MIGRATION_DATABASE_URL);
  runtime = createOrm(process.env.DATABASE_URL);
  health = createDatabase(process.env.DATABASE_URL, 500);
  auth = createLocalAuthFixture();
  owner = await auth.createConfirmedUser();
  users.push(owner.session.user.id);
  member = await auth.createConfirmedUser();
  users.push(member.session.user.id);
  journalDirectory = await mkdtemp(join(tmpdir(), "joint-privacy-browser-"));
  await chmod(journalDirectory, 0o700);
  const privacyJournalPath = join(journalDirectory, "journal.jsonl");
  await writeFile(privacyJournalPath, "", { mode: 0o600 });
  application = await createApplication(health, undefined, {
    database: runtime,
    environment: authServerEnvironmentSchema.parse(process.env),
    importKey,
    privacyJournalPath,
    events: withEvents
      ? new StatusEventHub((callbacks) =>
          createDatabaseNotifications({
            topic: "status",
            connectionString: process.env.DATABASE_URL ?? "",
            timeoutMs: 1000,
            retryMaxMs: 1000,
            ...callbacks,
          }),
        )
      : undefined,
  });
  await application.listen(apiPort, "127.0.0.1");
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
      webPort,
    ],
    {
      cwd: fileURLToPath(new URL("../../apps/web/", import.meta.url)),
      env: {
        ...process.env,
        API_BASE_URL: `http://127.0.0.1:${apiPort}`,
        WEB_ORIGIN: activeOrigin,
      },
      stdio: "ignore",
    },
  );
  await waitForWeb();
}
export async function stopPrivacyBrowser(): Promise<void> {
  await stopWeb();
  if (application) await application.close();
  if (runtime) await runtime.$disconnect();
  if (database) {
    await database.deletionRequest.deleteMany({
      where: { userId: { in: users } },
    });
    await database.exportRequest.deleteMany({
      where: { userId: { in: users } },
    });
    await database.entitlementGrant.deleteMany({
      where: { householdId: { in: households } },
    });
    await database.entitlementGrantAudit.deleteMany({
      where: { householdId: { in: households } },
    });
    await database.budgetScope.deleteMany({
      where: { householdId: { in: households } },
    });
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
  users.length = 0;
  households.length = 0;
  if (health) await health.close();
  if (journalDirectory) await rm(journalDirectory, { recursive: true });
}

export async function capture(page: Page, name: string): Promise<void> {
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
  const zoomLayout = await page.evaluate(() => ({
    viewport: window.innerWidth,
    scrollWidth: document.documentElement.scrollWidth,
    overflowing: Array.from(document.querySelectorAll("body *"))
      .flatMap((element) => {
        const rect = element.getBoundingClientRect();
        if (
          rect.right <= window.innerWidth + 1 &&
          rect.left >= -1 &&
          element.scrollWidth <= element.clientWidth + 1
        )
          return [];
        const style = getComputedStyle(element);
        return [
          {
            tag: element.tagName,
            className: element.className,
            left: rect.left,
            right: rect.right,
            width: rect.width,
            clientWidth: element.clientWidth,
            scrollWidth: element.scrollWidth,
            minWidth: style.minWidth,
            display: style.display,
            whiteSpace: style.whiteSpace,
            overflowWrap: style.overflowWrap,
          },
        ];
      })
      .slice(0, 25),
  }));
  await page.screenshot({
    path: `/tmp/joint-live-${name}-zoom.png`,
    fullPage: true,
  });
  expect(
    zoomLayout.scrollWidth,
    JSON.stringify(zoomLayout),
  ).toBeLessThanOrEqual(zoomLayout.viewport);
  await page.evaluate(() => {
    document.body.style.zoom = "";
  });
  await page.setViewportSize({ width: 390, height: 844 });
}
