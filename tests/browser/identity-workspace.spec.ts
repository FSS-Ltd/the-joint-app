import { expect, test } from "@playwright/test";
import {
  identityWorkspaceFixture,
  soloIdentity,
} from "../fixtures/identity-workspace.js";
test.use({ serviceWorkers: "block" });

test("authenticated setup retry keeps a visible focus ring on ivory", async ({
  page,
}) => {
  const fixture = await identityWorkspaceFixture(page);
  fixture.setIdentity({ ...soloIdentity, membership: null });
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/household");
  await page.getByLabel("Household name").fill("Synthetic retry household");
  await page.route("**/api/households", (route) => route.fulfill({ json: {} }));
  await page.route("**/api/me", (route) =>
    route.fulfill({
      status: 503,
      json: {
        error: {
          code: "UNAVAILABLE",
          message: "Household temporarily unavailable.",
        },
      },
    }),
  );
  await page
    .getByRole("button", { name: "Create household", exact: true })
    .click();
  const retry = page.getByRole("button", { name: "Try again", exact: true });
  await expect(retry).toBeVisible();
  await page.keyboard.press("Tab");
  await retry.focus();
  await expect(retry).toHaveCSS("outline-color", "rgb(128, 90, 39)");
});

test("solo household keeps invitation optional and account access sends no invitation", async ({
  page,
}) => {
  const fixture = await identityWorkspaceFixture(page);
  await page.goto("/household");
  const overview = page.getByRole("region", {
    name: "Household overview",
    exact: true,
  });
  await expect(overview).toContainText("1 of 2 adults");
  await expect(
    page.getByRole("heading", { name: "Invite your person" }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Invite later", exact: false }).click();
  await expect(page).toHaveURL(/\/accounts$/);
  expect(fixture.invitationPosts()).toBe(0);
});

test("full or member households do not expose admin invitation controls", async ({
  page,
}) => {
  const fixture = await identityWorkspaceFixture(page);
  const membership = soloIdentity.membership;
  if (!membership) throw Error("Missing synthetic membership");
  for (const next of [
    { ...membership, household: { ...membership.household, memberCount: 2 } },
    { ...membership, role: "MEMBER" as const },
  ]) {
    fixture.setIdentity({ ...soloIdentity, membership: next });
    await page.goto("/household");
    await expect(
      page.getByRole("heading", { name: "Your household is ready" }),
    ).toBeVisible();
    await expect(page.getByLabel("Their email address")).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Create invitation link" }),
    ).toHaveCount(0);
  }
});

test("household invitation stays explicit and its long private link remains usable", async ({
  page,
}) => {
  const fixture = await identityWorkspaceFixture(page);
  await page.goto("/household");
  await page.getByLabel("Their email address").fill("invited@example.test");
  await page.getByRole("button", { name: "Create invitation link" }).click();
  await expect(page.getByLabel("Private invitation link")).toHaveValue(
    /\/join#invite=synthetic-private-invitation/,
  );
  await expect(
    page.getByRole("button", { name: "Copy invitation link" }),
  ).toBeEnabled();
  expect(fixture.invitationPosts()).toBe(1);
  const expectedLink = `${new URL(page.url()).origin}/join#invite=${"synthetic-private-invitation-".repeat(6)}`;
  for (const width of [320, 390, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    for (const zoom of ["1", "2"]) {
      await page.evaluate((value) => {
        document.body.style.zoom = value;
      }, zoom);
      const link = page.getByLabel("Private invitation link");
      await expect(link).toHaveValue(expectedLink);
      await expect(link).toHaveAttribute("readonly", "");
      const box = await link.boundingBox();
      expect(box?.width).toBeGreaterThanOrEqual(120);
      expect(box?.height).toBeGreaterThanOrEqual(44);
      expect(
        await link.evaluate(
          (element) => element.scrollWidth <= element.clientWidth + 1,
        ),
      ).toBe(true);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await expect(
        page.getByRole("button", { name: "Copy invitation link" }),
      ).toBeEnabled();
    }
    await page.evaluate(() => {
      document.body.style.zoom = "";
    });
    await page.evaluate(() => {
      if (document.activeElement instanceof HTMLElement)
        document.activeElement.blur();
      window.scrollTo(0, 0);
    });
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
    if (width === 390 || width === 1280)
      await page.screenshot({
        path: `/tmp/joint-ui7-household-normal-${width}.png`,
        fullPage: true,
      });
  }
});

test("inactivity clears protected content before failed sign-out and offers retry", async ({
  page,
}) => {
  await identityWorkspaceFixture(page);
  let reads = 0;
  await page.route("**/api/auth/session", (route) => {
    reads++;
    return reads === 1
      ? route.fulfill({
          json: {
            expiresAt: new Date(Date.now() + 1500).toISOString(),
            serverTime: new Date().toISOString(),
          },
        })
      : route.fulfill({
          status: 401,
          json: { error: { code: "UNAUTHORIZED" } },
        });
  });
  await page.route("**/api/auth/logout", (route) =>
    route.fulfill({
      status: 503,
      json: { error: { message: "Sign-out unavailable" } },
    }),
  );
  await page.goto("/household");
  await expect(
    page.getByRole("heading", { name: "Invite your person" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Your session is locked" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Invite your person" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Retry sign-out" }),
  ).toBeVisible();
  await page.evaluate(() => {
    window.dispatchEvent(new Event("online"));
    window.dispatchEvent(
      new PageTransitionEvent("pagehide", { persisted: true }),
    );
    window.dispatchEvent(
      new PageTransitionEvent("pageshow", { persisted: true }),
    );
  });
  await page.waitForTimeout(150);
  await expect(
    page.getByRole("button", { name: "Retry sign-out" }),
  ).toBeVisible();
  for (const width of [390, 1280]) {
    await page.setViewportSize({ width, height: 844 });
    await page.getByRole("button", { name: "Retry sign-out" }).focus();
    await expect(
      page.getByRole("button", { name: "Retry sign-out" }),
    ).toBeFocused();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `/tmp/joint-auth3-lock-${width}.png`,
      fullPage: true,
    });
  }
});

test("only trusted input reports activity; programmatic events do not renew access", async ({
  page,
}) => {
  const fixture = await identityWorkspaceFixture(page);
  fixture.setIdentity({ ...soloIdentity, membership: null });
  const activity: unknown[] = [];
  await page.route("**/api/auth/session", (route) => {
    if (route.request().method() === "POST")
      activity.push(route.request().postDataJSON());
    return route.fulfill({
      json: {
        expiresAt: new Date(Date.now() + 600_000).toISOString(),
        serverTime: new Date().toISOString(),
      },
    });
  });
  await page.goto("/household");
  await expect(page.getByLabel("Household name")).toBeVisible();
  await page.evaluate(() =>
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "x" })),
  );
  await page.waitForTimeout(150);
  expect(activity).toHaveLength(0);
  await page.getByLabel("Household name").fill("Synthetic active home");
  // fill() emits trusted input but no keyboard event; deliberate key presses renew the session.
  await page.getByLabel("Household name").press("End");
  await expect.poll(() => activity.length).toBeGreaterThan(0);
  expect(activity[0]).toEqual({ activityAgeMs: expect.any(Number) });
});

for (const accepted of [false, true]) {
  test(`authenticated invitation content expires (accepted=${accepted})`, async ({
    page,
  }) => {
    await identityWorkspaceFixture(page);
    let expiresAt = 0;
    await page.route("**/api/auth/session", (route) => {
      const now = Date.now();
      expiresAt ||= now + 1800;
      return now >= expiresAt
        ? route.fulfill({
            status: 401,
            json: { error: { code: "UNAUTHORIZED" } },
          })
        : route.fulfill({
            json: {
              expiresAt: new Date(expiresAt).toISOString(),
              serverTime: new Date(now).toISOString(),
            },
          });
    });
    await page.route("**/api/auth/logout", (route) =>
      route.fulfill({
        status: 503,
        json: { error: { message: "Synthetic sign-out outage" } },
      }),
    );
    await page.route("**/api/invitations/accept", (route) =>
      route.fulfill({ json: { state: "ACCEPTED" } }),
    );
    await page.goto("/join");
    await expect(
      page.getByText(soloIdentity.user.email, { exact: true }),
    ).toBeVisible();
    if (accepted) {
      await page
        .getByRole("button", { name: "Accept invitation", exact: true })
        .click();
      await expect(
        page.getByRole("heading", {
          name: "You're part of the household",
          exact: true,
        }),
      ).toBeVisible();
      await expect(
        page.getByText(soloIdentity.membership?.household.name ?? "", {
          exact: true,
        }),
      ).toBeVisible();
    }
    await expect(
      page.getByRole("heading", { name: "Your session is locked" }),
    ).toBeVisible();
    await expect(
      page.getByText(soloIdentity.user.email, { exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Accept invitation", exact: true }),
    ).toHaveCount(0);
    if (accepted)
      await expect(
        page.getByText(soloIdentity.membership?.household.name ?? "", {
          exact: true,
        }),
      ).toHaveCount(0);
  });
}
