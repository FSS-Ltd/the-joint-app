import { expect, test } from "@playwright/test";
import {
  identityWorkspaceFixture,
  soloIdentity,
} from "../fixtures/identity-workspace.js";
test.use({ serviceWorkers: "block" });

for (const width of [320, 390, 800, 1280]) {
  for (const route of [
    "sign-in",
    "sign-up",
    "recovery",
    "household",
    "security",
    "join",
    "privacy/deletion",
  ]) {
    test(`${route} controls remain readable at ${width}px and 200% zoom`, async ({
      page,
    }) => {
      const fixture = await identityWorkspaceFixture(page);
      const membership = soloIdentity.membership;
      if (!membership) throw Error("Missing synthetic membership");
      fixture.setIdentity({
        ...soloIdentity,
        user: {
          ...soloIdentity.user,
          email: `${"household".repeat(6)}@example.test`,
        },
        membership: {
          ...membership,
          household: {
            ...membership.household,
            name: "HouseholdNameWithoutBreaks".repeat(4).slice(0, 80),
          },
        },
      });
      await page.setViewportSize({ width, height: 900 });
      await page.emulateMedia({ reducedMotion: "reduce" });
      await page.goto(
        `/${route}${route === "privacy/deletion" ? "?id=77777777-7777-4777-8777-777777777777" : ""}`,
      );
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      if (route === "sign-up") {
        await page
          .getByLabel("Email address")
          .fill("verification@example.test");
        await page
          .getByLabel("Password", { exact: true })
          .fill("Synthetic phrase only 123!");
        await page
          .getByRole("button", { name: "Create account", exact: true })
          .click();
        await expect(page.getByLabel("Email verification code")).toBeVisible();
      }
      if (route === "security") {
        await page
          .getByRole("button", { name: "Set up authenticator" })
          .click();
        await page
          .getByText("Enter a setup key instead", { exact: true })
          .click();
        await expect(page.locator(".setup-secret")).toBeVisible();
      }
      for (const zoom of ["1", "2"]) {
        await page.evaluate((value) => {
          document.body.style.zoom = value;
        }, zoom);
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        ).toBe(true);
        const inputs = page.locator("main input:visible");
        for (const input of await inputs.all()) {
          const box = await input.boundingBox();
          expect(box?.width).toBeGreaterThanOrEqual(120);
          expect(box?.height).toBeGreaterThanOrEqual(44);
        }
      }
      if (width === 1280 && ["household", "security"].includes(route)) {
        await page.evaluate(() => {
          document.body.style.zoom = "";
        });
        const intro = await page.locator(".identity-intro").boundingBox();
        const content = await page.locator(".identity-content").boundingBox();
        if (!intro || !content) throw Error("Missing identity layout");
        expect(content.y).toBeGreaterThanOrEqual(intro.y + intro.height);
      }
      await page.evaluate(() => {
        document.body.style.zoom = "";
        window.scrollTo(0, 0);
      });
      if (
        (width === 390 || width === 1280) &&
        ["sign-up", "security", "household"].includes(route)
      )
        await page.screenshot({
          path: `/tmp/joint-ui7-${route}-${width}.png`,
          fullPage: true,
        });
    });
  }
}
