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
  for (const width of [390, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await page.evaluate(() => {
      if (document.activeElement instanceof HTMLElement)
        document.activeElement.blur();
      window.scrollTo(0, 0);
    });
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
    await page.screenshot({
      path: `/tmp/joint-ui7-household-normal-${width}.png`,
      fullPage: true,
    });
  }
});
