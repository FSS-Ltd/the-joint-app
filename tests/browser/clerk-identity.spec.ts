import { spawn, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { fileURLToPath } from "node:url";
import { test, expect } from "@playwright/test";
import { syntheticClerkBrowser } from "../fixtures/clerk-browser.js";
import { createClerkFixture } from "../fixtures/clerk.js";
import { registerClerkWorkspaceCases } from "../fixtures/identity-clerk-workspace.js";

const origin = "http://127.0.0.1:3311";
registerClerkWorkspaceCases(origin);
let web: ChildProcess | undefined;
const fixture = await createClerkFixture();
test.use({ baseURL: origin, serviceWorkers: "block" });
test.beforeAll(async () => {
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
      "3311",
    ],
    {
      cwd: fileURLToPath(new URL("../../apps/web/", import.meta.url)),
      env: {
        ...process.env,
        ...Object.fromEntries(
          Object.entries(fixture.environment).map(([key, value]) => [
            key,
            Array.isArray(value) ? value.join(",") : String(value),
          ]),
        ),
        AUTH_PROVIDER: "clerk",
        CLERK_AUTHORIZED_PARTIES: origin,
        NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY:
          "pk_test_" +
          Buffer.from(
            new URL(fixture.environment.CLERK_ISSUER).hostname + "$",
          ).toString("base64"),
        WEB_ORIGIN: origin,
      },
      stdio: "ignore",
    },
  );
  for (let attempt = 0; attempt < 100; attempt++) {
    if (web.exitCode !== null)
      throw Error("Isolated Clerk UI exited before becoming ready");
    try {
      await fetch(origin, {
        signal: AbortSignal.timeout(500),
        redirect: "manual",
      });
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
  throw Error("Isolated Clerk UI did not become ready");
});
test.afterAll(async () => {
  if (!web || web.exitCode !== null) return;
  const exited = once(web, "exit");
  web.kill("SIGTERM");
  const timer = setTimeout(() => web?.kill("SIGKILL"), 5000);
  try {
    await exited;
  } finally {
    clearTimeout(timer);
  }
});
test("configured Clerk page renders without a separate middleware encryption key", async ({
  request,
}) => {
  // A synthetic development-browser cookie avoids the external development handshake; it grants no session.
  const response = await request.get("/sign-up", {
    headers: { Cookie: "__clerk_db_jwt=synthetic-development-browser-only" },
  });
  expect(response.status()).toBe(200);
  expect(await response.text()).not.toContain(
    fixture.environment.CLERK_SECRET_KEY,
  );
});
for (const width of [390, 1280])
  test(`provider outage stays accessible and does not fall back to legacy signup at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.context().addCookies([
      {
        name: "__clerk_db_jwt",
        value: "synthetic-development-browser-only",
        url: origin,
      },
    ]);
    await page.route(/https:\/\/.*clerk.*\//, (route) => route.abort());
    let legacyPosts = 0;
    page.on("request", (request) => {
      if (
        request.method() === "POST" &&
        request.url().includes("/api/auth/signup")
      )
        legacyPosts++;
    });
    await page.goto("/sign-up");
    await expect(
      page.getByRole("link", { name: "The Family Fund App home" }),
    ).toBeVisible();
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await expect(
      page.getByRole("button", { name: "Create account", exact: true }),
    ).toHaveCount(0);
    await page.getByRole("link", { name: "Skip to content" }).focus();
    await expect(
      page.getByRole("link", { name: "Skip to content" }),
    ).toBeFocused();
    expect(legacyPosts).toBe(0);
  });
test("opening a second household tab does not create a session-change reload loop", async ({
  page,
  context,
}) => {
  await context.addCookies([
    {
      name: "__clerk_db_jwt",
      value: "synthetic-development-browser-only",
      url: origin,
    },
  ]);
  await context.route(/https:\/\/.*clerk.*\//, (route) => route.abort());
  await context.route("**/api/me", (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({
        error: {
          code: "UNAVAILABLE",
          message: "Synthetic service unavailable",
        },
      }),
    }),
  );
  const second = await context.newPage();
  let firstLoads = 0,
    secondLoads = 0;
  page.on("load", () => {
    firstLoads++;
  });
  second.on("load", () => {
    secondLoads++;
  });
  try {
    await page.goto("/household");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await second.goto(origin + "/household");
    await expect(second.getByRole("heading", { level: 1 })).toBeVisible();
    // A mount announcement otherwise makes the two pages repeatedly reload each other.
    await page.waitForTimeout(1500);
    expect(firstLoads).toBe(1);
    expect(secondLoads).toBe(1);
  } finally {
    await second.close();
  }
});

test("custom sign-up verifies errors, resend and successful completion through SDK resources", async ({
  page,
  context,
}) => {
  const actions = await syntheticClerkBrowser(context, origin, "signup");
  await page.clock.install();
  await page.goto("/sign-up");
  await page.getByLabel("Email address").fill("synthetic@example.test");
  await page
    .getByLabel("Password", { exact: true })
    .fill("Synthetic phrase only 123!");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(
    page.getByRole("heading", { name: "Verify your email" }),
  ).toBeVisible();
  await page.getByLabel("Email verification code").fill("000000");
  await page.getByRole("button", { name: "Verify code" }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: /code/ }),
  ).toContainText("did not match");
  await page.getByLabel("Email verification code").fill("999999");
  await page.getByRole("button", { name: "Verify code" }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: /code/ }),
  ).toContainText("expired");
  await expect(
    page.getByRole("button", { name: /Send a new code/ }),
  ).toBeDisabled();
  await page.clock.fastForward(30_000);
  await page
    .getByRole("button", { name: "Send a new code", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("new verification code");
  await page.getByLabel("Email verification code").fill("424242");
  await page.getByRole("button", { name: "Verify code" }).click();
  await expect.poll(() => actions.includes("signup-finalize")).toBe(true);
  expect(actions.filter((value) => value === "signup-send")).toHaveLength(2);
});
test("switching account forms retains the archive destination", async ({
  page,
  context,
}) => {
  await syntheticClerkBrowser(context, origin, "signup");
  await page.goto("/sign-up?next=archive");
  const signIn = page.getByRole("link", { name: "Sign in", exact: true });
  await expect(signIn).toHaveAttribute("href", "/sign-in?next=archive");
  await signIn.click();
  const recovery = page.getByRole("link", { name: "Forgot your password?" });
  await expect(recovery).toHaveAttribute("href", "/recovery?next=archive");
  await recovery.click();
  await expect(page).toHaveURL(origin + "/recovery?next=archive");
  await expect(
    page.getByRole("link", { name: "Create an account", exact: true }),
  ).toHaveAttribute("href", "/sign-up?next=archive");
});

for (const action of ["leave", "delete"] as const)
  test(`${action} retries Clerk cleanup without repeating the completed privacy mutation`, async ({
    page,
    context,
  }) => {
    const actions = await syntheticClerkBrowser(
      context,
      origin,
      "cleanup-failure",
    );
    await context.addInitScript(() =>
      sessionStorage.setItem("clerkSyntheticStage", "complete"),
    );
    const householdId = "10000000-0000-4000-8000-000000000001";
    await context.route("**/api/me", (route) =>
      route.fulfill({
        json: {
          user: {
            id: "20000000-0000-4000-8000-000000000002",
            email: "synthetic@example.test",
          },
          membership: {
            id: "30000000-0000-4000-8000-000000000003",
            householdId,
            role: "ADMIN",
            grantVersion: 0,
            household: {
              name: "Synthetic household",
              memberCount: 1,
              baseCurrency: "GBP",
              timezone: "Europe/London",
            },
          },
          session: {
            aal: "aal2",
            expiresAt: new Date(Date.now() + 3600000).toISOString(),
            needsMfa: false,
            purpose: "NORMAL",
          },
          factors: [],
        },
      }),
    );
    await context.route(
      `**/api/households/${householdId}/accounts?*`,
      (route) => route.fulfill({ json: { items: [], nextCursor: null } }),
    );
    let mutations = 0;
    await context.route(
      action === "leave"
        ? `**/api/households/${householdId}/memberships/me`
        : "**/api/privacy/deletion-requests",
      (route) => {
        mutations++;
        return route.fulfill({
          json: { id: "40000000-0000-4000-8000-000000000004" },
        });
      },
    );
    await page.goto("/settings/privacy");
    await page
      .getByRole("button", {
        name: action === "leave" ? "Leave household" : "Delete my account",
        exact: true,
      })
      .click();
    await page.getByRole("checkbox", { name: /I understand/ }).check();
    await page
      .getByRole("button", {
        name:
          action === "leave"
            ? "Confirm and leave household"
            : "Confirm and delete my account",
      })
      .click();
    await expect(
      page.getByRole("button", { name: "Retry browser sign-out" }),
    ).toBeVisible();
    expect(mutations).toBe(1);
    await page.getByRole("button", { name: "Retry browser sign-out" }).click();
    await expect(page).toHaveURL(
      action === "leave"
        ? origin + "/sign-in?next=archive"
        : origin + "/privacy/deletion?id=40000000-0000-4000-8000-000000000004",
    );
    expect(mutations).toBe(1);
    expect(actions.filter((value) => value === "sign-out")).toHaveLength(2);
  });

for (const scenario of ["login", "device", "google", "recovery"] as const)
  test(`custom ${scenario} completes the SDK challenge and preserves its continuation`, async ({
    page,
    context,
  }) => {
    const actions = await syntheticClerkBrowser(context, origin, scenario);
    await page.goto(
      scenario === "recovery"
        ? "/recovery?next=archive"
        : "/sign-in?next=archive",
    );
    if (scenario === "google") {
      // The callback can immediately return to sign-in for the MFA challenge.
      await Promise.all([
        page.waitForRequest(`${origin}/auth/callback?next=archive`, {
          timeout: 5000,
        }),
        page.getByRole("button", { name: "Continue with Google" }).click(),
      ]);
    } else {
      await page.getByLabel("Email address").fill("synthetic@example.test");
      if (scenario !== "recovery")
        await page
          .getByLabel("Password", { exact: true })
          .fill("Synthetic phrase only 123!");
      await page
        .getByRole("button", {
          name: scenario === "recovery" ? "Send recovery code" : "Sign in",
          exact: true,
        })
        .click();
    }
    const label =
      scenario === "device" || scenario === "recovery"
        ? "Email verification code"
        : "Authenticator code";
    await page.getByLabel(label).fill("000000");
    if (scenario === "google")
      await expect(page).toHaveURL(`${origin}/sign-in?next=archive`);
    await page
      .getByRole("button", { name: "Verify code", exact: true })
      .click();
    await expect(
      page.getByRole("alert").filter({ hasText: /code/ }),
    ).toContainText("did not match");
    await page.getByLabel(label).fill("424242");
    await page
      .getByRole("button", { name: "Verify code", exact: true })
      .click();
    if (scenario === "recovery") {
      await page
        .getByLabel("New password", { exact: true })
        .fill("A new synthetic phrase 123!");
      await page.getByRole("button", { name: "Save new password" }).click();
      await expect.poll(() => actions.includes("recovery-password")).toBe(true);
    }
    await expect.poll(() => actions.includes("sign-in-finalize")).toBe(true);
    if (scenario === "device") {
      expect(actions).toContain("device-email-send");
      expect(actions).not.toContain("totp-verify");
    }
  });

test("lost authenticator sign-in accepts a backup code and routes to restricted security recovery", async ({
  page,
  context,
}) => {
  const actions = await syntheticClerkBrowser(context, origin, "login");
  await page.goto("/sign-in?next=archive");
  await page.getByLabel("Email address").fill("synthetic@example.test");
  await page
    .getByLabel("Password", { exact: true })
    .fill("Synthetic phrase only 123!");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page
    .getByRole("button", { name: "Use a backup code", exact: true })
    .click();
  await page
    .getByLabel("Backup code", { exact: true })
    .fill("synthetic-backup-code");
  await page.getByRole("button", { name: "Verify code", exact: true }).click();
  await expect.poll(() => actions.includes("backup-code-verify")).toBe(true);
  await expect(page).toHaveURL(origin + "/security?next=archive&recover=1");
  await expect(
    page.getByRole("button", { name: "Replace lost authenticator" }),
  ).toBeVisible();
  await context.route("**/api/me", (route) =>
    route.fulfill({ json: { session: { needsMfa: true } } }),
  );
  await page
    .getByRole("button", { name: "Replace lost authenticator" })
    .click();
  await page.getByRole("button", { name: "Set up authenticator" }).click();
  await expect(
    page.getByRole("img", {
      name: "Scan this private setup QR code with your authenticator app",
    }),
  ).toHaveAttribute("src", /^data:image\/png;base64,/);
  await expect(
    page.getByRole("img", {
      name: "Scan this private setup QR code with your authenticator app",
    }),
  ).toHaveJSProperty("naturalWidth", 200);
  await page.getByText("Enter a setup key instead", { exact: true }).click();
  await expect(page.locator(".setup-secret")).toHaveText("JBSWY3DPEHPK3PXP");
  await page.getByLabel("Authenticator code", { exact: true }).fill("000000");
  await page
    .getByRole("button", { name: "Verify authenticator", exact: true })
    .click();
  await expect(
    page.getByRole("alert").filter({ hasText: /try again/ }),
  ).toBeVisible();
  await page.getByLabel("Authenticator code", { exact: true }).fill("424242");
  await page
    .getByRole("button", { name: "Verify authenticator", exact: true })
    .click();
  await expect(
    page.getByRole("status").filter({ hasText: /Authenticator enabled/ }),
  ).toBeVisible();
  let proofs = 0;
  await context.route("**/api/auth/mfa/verify", (route) => {
    proofs++;
    expect(route.request().postDataJSON().factorId).toBe("clerk_totp");
    return proofs === 1
      ? route.fulfill({
          status: 403,
          json: {
            error: {
              code: "MFA_REAUTH_REQUIRED",
              message: "Verify a fresh code.",
            },
          },
        })
      : route.fulfill({ json: { state: "AUTHENTICATED" } });
  });
  await page.getByLabel("Authenticator code", { exact: true }).fill("111111");
  await page
    .getByRole("button", { name: "Verify authenticator", exact: true })
    .click();
  await expect(
    page.getByRole("alert").filter({ hasText: /fresh code/ }),
  ).toBeVisible();
  await page.getByLabel("Authenticator code", { exact: true }).fill("424242");
  await page
    .getByRole("button", { name: "Verify authenticator", exact: true })
    .click();
  await expect(page).toHaveURL(origin + "/archive");
  expect(proofs).toBe(2);
});

test("provider-pending logout remains visible and retries after browser sign-out and a page reload", async ({
  page,
  context,
}) => {
  const actions = await syntheticClerkBrowser(context, origin, "logout");
  await context.route("**/api/me", (route) =>
    route.fulfill({
      json: {
        user: {
          id: "20000000-0000-4000-8000-000000000002",
          email: "synthetic@example.test",
        },
        membership: null,
        session: {
          aal: "aal2",
          needsMfa: false,
          purpose: "NORMAL",
          expiresAt: new Date(Date.now() + 3600000).toISOString(),
        },
        factors: [],
      },
    }),
  );
  let starts = 0,
    retries = 0;
  await context.route("**/api/auth/logout", (route) => {
    starts++;
    return route.fulfill({
      json: { state: "SIGNED_OUT", providerCleanupPending: true },
      headers: {
        "Set-Cookie":
          "joint-logout-cleanup=v1.synthetic.nonce.ciphertext; Path=/; HttpOnly; SameSite=Strict",
      },
    });
  });
  await context.route("**/api/auth/logout/retry", (route) => {
    retries++;
    return route.fulfill({
      json: { state: "SIGNED_OUT" },
      headers: {
        "Set-Cookie":
          "joint-logout-cleanup=; Path=/; Max-Age=0; HttpOnly; SameSite=Strict",
      },
    });
  });
  await page.goto("/household");
  await page
    .getByRole("button", { name: "Sign out on all devices", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Provider cleanup pending" }),
  ).toBeVisible();
  await expect.poll(() => actions.includes("sign-out")).toBe(true);
  await page.goto("/sign-in");
  await page.getByRole("link", { name: "Finish previous sign-out" }).click();
  await page.reload();
  await page.getByRole("button", { name: "Retry sign-out cleanup" }).click();
  await expect(page).toHaveURL(origin + "/sign-in");
  expect(starts).toBe(1);
  expect(retries).toBe(1);
  await expect(
    page.getByRole("link", { name: "Finish previous sign-out" }),
  ).toHaveCount(0);
});

for (const task of ["mfa", "password"] as const)
  test(`Google callback routes the mandatory ${task} task before app completion`, async ({
    page,
    context,
  }) => {
    const actions = await syntheticClerkBrowser(
      context,
      origin,
      task === "mfa" ? "google-task" : "password-task",
    );
    await page.goto("/sign-in?next=archive");
    await page.getByRole("button", { name: "Continue with Google" }).click();
    await expect(
      page.getByRole("button", { name: `Complete synthetic ${task} task` }),
    ).toBeVisible();
    expect(page.url()).toContain(
      task === "mfa"
        ? "/security?next=archive"
        : "/auth/task/password?next=archive",
    );
    const completion = page.waitForRequest(
      (request) => request.url() === origin + "/auth/complete?next=archive",
    );
    await page
      .getByRole("button", { name: `Complete synthetic ${task} task` })
      .click();
    await completion;
    expect(actions).toContain(`task-${task}-complete`);
  });

test("an existing browser session can finish signing out without losing the archive destination", async ({
  page,
  context,
}) => {
  const actions = await syntheticClerkBrowser(context, origin, "existing");
  await page.goto("/sign-in?next=archive");
  await page.getByRole("button", { name: "Sign out of this browser" }).click();
  await expect.poll(() => actions.includes("sign-out")).toBe(true);
  await expect(
    page.getByRole("button", { name: "Sign out of this browser" }),
  ).toHaveCount(0);
  await expect(page).toHaveURL(origin + "/sign-in?next=archive");
});

for (const scenario of ["signup-username", "google-username"]) {
  test(`${scenario} collects the missing username and preserves the destination`, async ({
    page,
    context,
  }) => {
    const actions = await syntheticClerkBrowser(context, origin, scenario);
    await page.goto("/sign-up?next=archive");
    if (scenario === "google-username") {
      await page.getByRole("button", { name: "Continue with Google" }).click();
    } else {
      await page.getByLabel("Email address").fill("synthetic@example.test");
      await page
        .getByLabel("Password", { exact: true })
        .fill("Synthetic phrase only 123!");
      await page
        .getByRole("button", { name: "Create account", exact: true })
        .click();
      await page.getByLabel("Email verification code").fill("424242");
      await page
        .getByRole("button", { name: "Verify code", exact: true })
        .click();
    }
    await expect(
      page.getByRole("heading", { name: "Choose your username" }),
    ).toBeVisible();
    await expect(page).toHaveURL(origin + "/sign-up?next=archive");
    await page.getByLabel("Username", { exact: true }).fill("taken");
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await expect(
      page.getByRole("alert").filter({ hasText: "already in use" }),
    ).toBeVisible();
    expect(actions).not.toContain("signup-finalize");
    await page.getByLabel("Username", { exact: true }).fill("synthetic-family");
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await expect.poll(() => actions.includes("signup-finalize")).toBe(true);
    await expect(page).toHaveURL(/next=archive/);
    expect(actions.filter((action) => action === "signup-send")).toHaveLength(
      scenario === "signup-username" ? 1 : 0,
    );
  });
}
