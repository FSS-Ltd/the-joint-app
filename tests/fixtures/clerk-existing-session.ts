import { expect, test } from "@playwright/test";
import { identity } from "./account-workspace.js";
import { syntheticClerkBrowser } from "./clerk-browser.js";

export function registerExistingSessionCases(origin: string): void {
  for (const [query, destination, membership] of [
    ["", "/dashboard", identity.membership],
    ["?next=archive", "/archive", identity.membership],
    ["", "/household", null],
  ] as const) {
    test(`existing session automatically reaches ${destination}`, async ({
      page,
      context,
    }) => {
      await syntheticClerkBrowser(context, origin, "existing");
      await page.route("**/api/me", (route) =>
        route.fulfill({ json: { ...identity, membership } }),
      );
      await page.goto(`/sign-in${query}`);
      await expect(page).toHaveURL(origin + destination);
      await expect(page.getByLabel("Password", { exact: true })).toHaveCount(0);
    });
  }

  for (const purpose of ["NORMAL", "RECOVERY"] as const) {
    test(`existing ${purpose} session preserves required security checks`, async ({
      page,
      context,
    }) => {
      await syntheticClerkBrowser(context, origin, "existing");
      await page.route("**/api/me", (route) =>
        route.fulfill({
          json: {
            ...identity,
            session: {
              ...identity.session,
              needsMfa: purpose === "NORMAL",
              purpose,
            },
          },
        }),
      );
      await page.goto("/sign-in");
      await expect(page).toHaveURL(
        purpose === "RECOVERY"
          ? /\/security\?.*recovery=1/
          : /\/security\?next=dashboard$/,
      );
    });
  }

  test("expired existing session clears browser auth and enables fresh credentials", async ({
    page,
    context,
  }) => {
    const actions = await syntheticClerkBrowser(context, origin, "existing");
    await page.route("**/api/me", (route) =>
      route.fulfill({
        status: 401,
        json: { error: { message: "Sign in again" } },
      }),
    );
    await page.route("**/api/auth/csrf", (route) =>
      route.fulfill({ json: { csrfToken: "synthetic-csrf" } }),
    );
    await page.route("**/api/auth/logout", (route) =>
      route.fulfill({
        status: 401,
        json: { error: { message: "Sign in again" } },
      }),
    );
    await page.goto("/sign-in");
    await expect.poll(() => actions.includes("sign-out")).toBe(true);
    await page.getByLabel("Email address").fill("synthetic@example.test");
    await page.getByLabel("Password", { exact: true }).fill("Synthetic only!");
    await expect(
      page.getByRole("button", { name: "Sign in", exact: true }),
    ).toBeEnabled();
    expect(actions).not.toContain("password-sign-in");
  });

  test("existing session failure has an explicit retry without background polling", async ({
    page,
    context,
  }) => {
    await syntheticClerkBrowser(context, origin, "existing");
    let reads = 0;
    await page.route("**/api/me", (route) => {
      reads++;
      return reads === 1
        ? route.fulfill({
            status: 503,
            json: { error: { message: "Synthetic temporary failure" } },
          })
        : route.fulfill({ json: identity });
    });
    await page.goto("/sign-in");
    const retry = page.getByRole("button", { name: "Retry session check" });
    await expect(retry).toBeVisible();
    await page.waitForTimeout(1200);
    expect(reads).toBe(1);
    await retry.click();
    await expect(page).toHaveURL(origin + "/dashboard");
  });

  test("existing session preserves legacy account-link verification", async ({
    page,
    context,
  }) => {
    await syntheticClerkBrowser(context, origin, "existing");
    await page.route("**/api/me", (route) =>
      route.fulfill({
        status: 409,
        json: {
          error: {
            code: "IDENTITY_MIGRATION_REQUIRED",
            message: "Verify your existing account",
          },
        },
      }),
    );
    await page.goto("/sign-in");
    await expect(
      page.getByRole("heading", { name: "Keep your existing household." }),
    ).toBeVisible();
    await expect(page).toHaveURL(origin + "/auth/complete?next=dashboard");
  });

  test("existing session honours the provider MFA task before dashboard access", async ({
    page,
    context,
  }) => {
    await context.addInitScript(() =>
      sessionStorage.setItem("clerkSyntheticStage", "complete"),
    );
    await syntheticClerkBrowser(context, origin, "google-task");
    await page.goto("/sign-in");
    await expect(page).toHaveURL(origin + "/security?next=dashboard");
    await expect(
      page.getByRole("button", { name: "Complete synthetic mfa task" }),
    ).toBeVisible();
  });
}
