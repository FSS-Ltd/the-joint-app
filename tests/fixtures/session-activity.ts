import type { Page } from "@playwright/test";

/** Synthetic session authority; passive reads never extend its deadline. */
export async function sessionActivityFixture(
  target: Pick<Page, "route">,
): Promise<void> {
  await target.route("**/api/auth/csrf", (route) =>
    route.fulfill({ json: { csrfToken: "synthetic-activity-csrf" } }),
  );
  let expiresAt = Date.now() + 600_000;
  await target.route("**/api/auth/session", (route) => {
    const now = Date.now();
    if (now >= expiresAt)
      return route.fulfill({
        status: 401,
        json: { error: { code: "UNAUTHORIZED" } },
      });
    if (route.request().method() === "POST") expiresAt = now + 600_000;
    return route.fulfill({
      json: {
        expiresAt: new Date(expiresAt).toISOString(),
        serverTime: new Date(now).toISOString(),
      },
    });
  });
}
