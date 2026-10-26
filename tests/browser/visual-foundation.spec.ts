import { sessionActivityFixture } from "../fixtures/session-activity.js";
import { expect, test } from "@playwright/test";
import type { MeResponse } from "../../packages/contracts/dist/index.js";

test.use({ serviceWorkers: "block" });
test.beforeEach(async ({ page }) => {
  const identity: MeResponse = {
    user: {
      id: "9d43465d-ed2b-4e21-a452-0459e4fd63e5",
      email: "visual-fixture@example.test",
    },
    membership: null,
    session: {
      aal: "aal2",
      expiresAt: "2099-01-01T00:00:00.000Z",
      needsMfa: false,
      mfaVerifiedAt: "2026-10-23T12:00:00.000Z",
      purpose: "NORMAL",
    },
    factors: [],
  };
  await page.route("**/api/**", (route) =>
    route.fulfill({
      status: 503,
      json: { error: { code: "UNAVAILABLE", message: "Synthetic outage" } },
    }),
  );
  await sessionActivityFixture(page);
  await page.route("**/api/me", (route) => route.fulfill({ json: identity }));
});

test("mobile navigation exposes secondary destinations with the keyboard", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/accounts");
  const navigation = page.getByRole("navigation", { name: "App", exact: true });
  await expect(
    navigation.getByRole("link", { name: "Accounts", exact: true }),
  ).toHaveAttribute("aria-current", "page");
  const more = navigation.getByText("More", { exact: true });
  await expect(more).toBeVisible();
  await more.focus();
  await expect(more).toHaveCSS("outline-color", "rgb(240, 214, 188)");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Tab");
  await expect(
    navigation.getByRole("link", { name: "Review", exact: true }),
  ).toBeFocused();
  await expect(
    navigation.getByRole("link", { name: "Review", exact: true }),
  ).toHaveCSS("outline-color", "rgb(128, 90, 39)");
  await page.evaluate(() => {
    document.body.style.zoom = "2";
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.evaluate(() => {
    document.body.style.zoom = "";
  });
  await navigation.getByRole("link", { name: "Privacy", exact: true }).click();
  await expect(page).toHaveURL(/\/settings\/privacy$/);
  await navigation.getByText("More", { exact: true }).click();
  await expect(
    navigation.getByRole("link", { name: "Privacy", exact: true }),
  ).toHaveAttribute("aria-current", "page");
});

test("mobile More dismisses when focus leaves and Escape restores its trigger", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 640 });
  await page.goto("/household");
  const navigation = page.getByRole("navigation", { name: "App", exact: true });
  const disclosure = navigation.locator("details");
  const more = navigation.locator("summary");
  await more.focus();
  await page.keyboard.press("Enter");
  await page.keyboard.press("Tab");
  await expect(
    navigation.getByRole("link", { name: "Review", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(more).toBeFocused();
  await expect(disclosure).not.toHaveAttribute("open");
  await page.keyboard.press("Enter");
  for (let step = 0; step < 7; step++) await page.keyboard.press("Tab");
  await expect(
    page.getByRole("button", { name: "Sign out", exact: true }),
  ).toBeFocused();
  await expect(disclosure).not.toHaveAttribute("open");
  await page.keyboard.press("Tab");
  await expect(page.getByLabel("Household name")).toBeFocused();
});

test("report navigation retains explicit scope only on report destinations", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/dashboard?month=2026-01");
  const navigation = page.getByRole("navigation", { name: "App", exact: true });
  await expect(
    navigation.getByRole("link", { name: "Budgets", exact: true }),
  ).toHaveAttribute("href", "/budgets?month=2026-01");
  await expect(
    navigation.getByRole("link", { name: "Review", exact: true }),
  ).toHaveAttribute("href", "/review?month=2026-01");
  await expect(
    navigation.getByRole("link", { name: "Accounts", exact: true }),
  ).toHaveAttribute("href", "/accounts");
  await expect(
    navigation.getByRole("link", { name: "Import CSV", exact: true }),
  ).toHaveAttribute("href", "/imports");
  await expect(navigation.getByText("Goals", { exact: true })).toHaveCount(0);
  await expect(navigation.getByText("Wealth", { exact: true })).toHaveCount(0);
});

test("signed-in household and security share the application navigation", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  for (const path of ["/household", "/security"]) {
    await page.goto(path);
    const navigation = page.getByRole("navigation", {
      name: "App",
      exact: true,
    });
    await expect(navigation).toBeVisible();
    await navigation.getByText("More", { exact: true }).click();
    await expect(
      navigation.getByRole("link", {
        name: path === "/household" ? "Household" : "Security",
        exact: true,
      }),
    ).toHaveAttribute("aria-current", "page");
  }
});

test("mobile keyboard focus stays clear of the floating navigation", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 640 });
  await page.goto("/household");
  await page.getByLabel("Household name").fill("Synthetic visual household");
  await page.getByRole("link", { name: "Skip to content" }).focus();
  let reachedEnd = false;
  for (let step = 0; step < 20; step++) {
    const focused = await page.evaluate(() => {
      const element = document.activeElement;
      const dock = document.querySelector(".app-navigation");
      if (!(element instanceof HTMLElement) || !dock)
        return { clear: false, label: "Missing focus or navigation" };
      const box = element.getBoundingClientRect(),
        navigation = dock.getBoundingClientRect();
      return {
        label:
          element.getAttribute("aria-label") ||
          element.getAttribute("id") ||
          element.textContent ||
          element.tagName,
        top: box.top,
        bottom: box.bottom,
        navigationTop: navigation.top,
        clear:
          box.top >= 0 &&
          box.bottom <= innerHeight &&
          (dock.contains(element) ||
            box.bottom <= navigation.top ||
            box.top >= navigation.bottom),
      };
    });
    expect(focused.clear, JSON.stringify(focused)).toBe(true);
    if (
      await page
        .getByRole("button", { name: "Sign out on all devices" })
        .evaluate((element) => element === document.activeElement)
    ) {
      reachedEnd = true;
      break;
    }
    await page.keyboard.press("Tab");
  }
  expect(reachedEnd).toBe(true);
});

for (const width of [320, 390, 1280]) {
  test(`shared visual foundation stays readable at ${width}px`, async ({
    page,
  }) => {
    test.setTimeout(60_000);
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    for (const path of ["/accounts", "/dashboard", "/household", "/sign-up"]) {
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await expect(page.locator(".surface").first()).toHaveCSS(
        "border-top-left-radius",
        "6px",
      );
      await expect(page.locator(".identity-shell")).toHaveCSS(
        "background-color",
        "rgb(32, 59, 50)",
      );
      if (width !== 320)
        await page.screenshot({
          path: `/tmp/joint-ui1-${path.slice(1)}-${width}.png`,
          fullPage: true,
        });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await page.getByRole("link", { name: "Skip to content" }).focus();
      await expect(
        page.getByRole("link", { name: "Skip to content" }),
      ).toBeFocused();
      await page.evaluate(() => {
        document.body.style.zoom = "2";
      });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await page.evaluate(() => {
        document.body.style.zoom = "";
      });
    }
  });
}
