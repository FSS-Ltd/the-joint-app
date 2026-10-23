import { spawn, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { fileURLToPath } from "node:url";
import { test, expect } from "@playwright/test";
import { createClerkFixture } from "../fixtures/clerk.js";

const origin = "http://127.0.0.1:3311";
let web: ChildProcess | undefined;
const fixture = await createClerkFixture();
test.use({ baseURL: origin });
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
