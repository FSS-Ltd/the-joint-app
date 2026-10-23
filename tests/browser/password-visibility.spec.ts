import { expect, test } from "@playwright/test";

for (const width of [390, 1280]) {
  for (const path of ["/sign-in", "/sign-up"]) {
    test(`password visibility on ${path} at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 844 });
      let authPosts = 0;
      page.on("request", (request) => {
        if (request.method() === "POST" && request.url().includes("/api/auth/"))
          authPosts++;
      });
      await page.goto(path);
      const input = page.getByLabel("Password", { exact: true });
      const show = page.getByRole("button", {
        name: "Show password",
        exact: true,
      });
      await expect(show).toBeEnabled({ timeout: 3000 });
      await expect(input).toHaveAttribute("type", "password");
      await expect(input).toHaveAttribute("spellcheck", "false");
      await expect(input).toHaveAttribute("autocapitalize", "none");
      expect(
        await input.evaluate((element) => getComputedStyle(element).fontSize),
      ).toBe(
        await page
          .getByLabel("Email address", { exact: true })
          .evaluate((element) => getComputedStyle(element).fontSize),
      );
      await input.fill("Synthetic phrase 123! Keep private");
      await show.focus();
      await page.keyboard.press("Space");
      const hide = page.getByRole("button", {
        name: "Hide password",
        exact: true,
      });
      await expect(hide).toBeFocused();
      await expect(hide).toHaveAttribute("aria-pressed", "true");
      await expect(input).toHaveAttribute("type", "text");
      await expect(input).toHaveValue("Synthetic phrase 123! Keep private");
      await input.fill("Edited synthetic phrase 456!");
      await hide.click();
      await expect(input).toHaveAttribute("type", "password");
      await expect(input).toHaveValue("Edited synthetic phrase 456!");
      await expect(show).toHaveAttribute("aria-pressed", "false");
      const target = await show.boundingBox();
      expect(target?.width).toBeGreaterThanOrEqual(44);
      expect(target?.height).toBeGreaterThanOrEqual(44);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      expect(authPosts).toBe(0);
      await page.reload();
      await expect(input).toHaveAttribute("type", "password");
      await expect(show).toHaveAttribute("aria-pressed", "false");
    });
  }
}

test("recovery reuses masked password control after its session boundary", async ({
  page,
}) => {
  await page.route("**/api/me", (route) =>
    route.fulfill({
      json: { session: { purpose: "RECOVERY", needsMfa: false } },
    }),
  );
  await page.goto("/recovery");
  await expect(
    page.getByRole("heading", { name: "Choose a new password" }),
  ).toBeVisible();
  const input = page.getByLabel("New password", { exact: true });
  await expect(input).toHaveAttribute("type", "password");
  await input.fill("Synthetic recovered phrase 123!");
  await page
    .getByRole("button", { name: "Show password", exact: true })
    .click();
  await expect(input).toHaveAttribute("type", "text");
  await expect(input).toHaveValue("Synthetic recovered phrase 123!");
  await expect(
    page.getByRole("button", { name: "Save new password" }),
  ).toBeVisible();
});

test("password visibility waits with the form while a submission is pending", async ({
  page,
}) => {
  let release: () => void = () => {},
    received: () => void = () => {};
  const gate = new Promise<void>((resolve) => {
      release = resolve;
    }),
    requestReceived = new Promise<void>((resolve) => {
      received = resolve;
    });
  await page.route("**/api/auth/signup", async (route) => {
    received();
    await gate;
    await route.fulfill({
      status: 400,
      json: { error: { message: "Synthetic rejected details" } },
    });
  });
  try {
    await page.goto("/sign-up");
    await page
      .getByLabel("Email address", { exact: true })
      .fill("visibility-fixture@example.test");
    await page
      .getByLabel("Password", { exact: true })
      .fill("Synthetic pending phrase 123!");
    const toggle = page.getByRole("button", {
      name: "Show password",
      exact: true,
    });
    await page
      .getByRole("button", { name: "Create account", exact: true })
      .click();
    await requestReceived;
    await expect(toggle).toBeDisabled();
    await expect(page.getByLabel("Password", { exact: true })).toBeDisabled();
    release();
    await expect(toggle).toBeEnabled();
    await expect(page.getByText("Synthetic rejected details")).toBeVisible();
  } finally {
    release();
    await page.unrouteAll({ behavior: "wait" });
  }
});
