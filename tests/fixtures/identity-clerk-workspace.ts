import { expect, test } from "@playwright/test";
import { syntheticClerkBrowser } from "./clerk-browser.js";

/** Register under the existing isolated Clerk server's setup and cleanup. */
export function registerClerkWorkspaceCases(origin: string): void {
  for (const width of [320, 390, 1280]) {
    for (const mode of ["email", "security"]) {
      test(`Clerk ${mode} controls remain readable at ${width}px and 200% zoom`, async ({
        page,
        context,
      }) => {
        await syntheticClerkBrowser(
          context,
          origin,
          mode === "email" ? "signup" : "existing",
        );
        await page.setViewportSize({ width, height: 900 });
        await page.emulateMedia({ reducedMotion: "reduce" });
        await page.goto(mode === "email" ? "/sign-up" : "/security");
        if (mode === "email") {
          await page.getByLabel("Email address").fill("synthetic@example.test");
          await page
            .getByLabel("Password", { exact: true })
            .fill("Synthetic phrase only 123!");
          await page
            .getByRole("button", { name: "Create account", exact: true })
            .click();
          await expect(
            page.getByLabel("Email verification code"),
          ).toBeVisible();
        } else {
          await expect(
            page.getByLabel("Authenticator code", { exact: true }),
          ).toBeVisible();
          await page
            .getByRole("button", { name: "Create new backup codes" })
            .click();
          await expect(
            page.getByRole("region", { name: "Private backup codes" }),
          ).toBeVisible();
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
          const input = page.getByLabel(
            mode === "email" ? "Email verification code" : "Authenticator code",
            { exact: true },
          );
          await input.fill("424242");
          const box = await input.boundingBox();
          expect(box?.width).toBeGreaterThanOrEqual(120);
          expect(box?.height).toBeGreaterThanOrEqual(44);
        }
        await page.evaluate(() => {
          document.body.style.zoom = "";
          window.scrollTo(0, 0);
        });
        if (width === 1280 && mode === "security") {
          const box = await page
            .getByLabel("Authenticator code", { exact: true })
            .boundingBox();
          expect(box?.width).toBeLessThanOrEqual(560);
        }
        if (width === 390 || width === 1280)
          await page.screenshot({
            path: `/tmp/joint-ui7-clerk-${mode}-${width}.png`,
            fullPage: true,
          });
      });
    }
  }
}
