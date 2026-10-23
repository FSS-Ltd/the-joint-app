import { expect, test } from "@playwright/test";
import {
  accountSchema,
  meResponseSchema,
  transactionSchema,
  spendingReportSchema,
  type TransactionResponse,
} from "../../packages/contracts/dist/index.js";
import { totp } from "../fixtures/local-auth.js";
import {
  origin,
  households,
  monthlyUsers,
  signIn,
  expectMutation,
  capture,
  startMonthlyBrowser,
  stopMonthlyBrowser,
} from "../fixtures/monthly-browser.js";
test.use({ baseURL: origin, actionTimeout: 15000 });
test.describe.configure({ mode: "serial" });
test.beforeAll(startMonthlyBrowser);
test.afterAll(stopMonthlyBrowser);
test("real monthly spending, owned transfer pairs, exact splits, budgets, coverage and safe offline shell", async ({
  page,
  context,
  browser,
}) => {
  test.setTimeout(180000);
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page, monthlyUsers().owner);
  await page.getByLabel("Household name").fill("Synthetic monthly household");
  await expectMutation(page, "/api/households", "POST", () =>
    page.getByRole("button", { name: "Create household" }).click(),
  );
  const me = meResponseSchema.parse(
    await (await context.request.get("/api/me")).json(),
  );
  if (!me.membership) throw new Error("Expected owner household");
  const h = me.membership.householdId;
  households.push(h);
  const base = `/api/households/${h}`;
  await page.goto(`${origin}/security?next=accounts`);
  await expectMutation(page, "/api/auth/mfa/enroll", "POST", () =>
    page.getByRole("button", { name: "Set up authenticator" }).click(),
  );
  const secret = await page.locator(".setup-secret").textContent();
  if (!secret) throw new Error("Expected local setup key");
  await page.getByLabel(/^Authenticator code/).fill(totp(secret));
  await page.getByRole("button", { name: "Verify code" }).click();
  await expect(page).toHaveURL(`${origin}/accounts`);
  async function mutate(
    path: string,
    body: object,
    method = "POST",
    version?: number,
  ) {
    const csrf = (await (
      await context.request.get("/api/auth/csrf")
    ).json()) as { csrfToken: string };
    const response = await context.request.fetch(path, {
      method,
      headers: {
        Origin: origin,
        "X-CSRF-Token": csrf.csrfToken,
        "Idempotency-Key": crypto.randomUUID(),
        ...(version === undefined ? {} : { "If-Match": `"${version}"` }),
      },
      data: body,
    });
    expect(response.status(), await response.text()).toBe(200);
    return response.json() as Promise<unknown>;
  }
  const current = accountSchema.parse(
    await mutate(`${base}/accounts`, {
      label: "Synthetic everyday",
      kind: "CURRENT",
      currency: "GBP",
      liquidity: "AVAILABLE",
    }),
  );
  const saving = accountSchema.parse(
    await mutate(`${base}/accounts`, {
      label: "Synthetic savings",
      kind: "SAVINGS",
      currency: "GBP",
      liquidity: "AVAILABLE",
    }),
  );
  const card = accountSchema.parse(
    await mutate(`${base}/accounts`, {
      label: "Synthetic card",
      kind: "CREDIT_CARD",
      currency: "GBP",
      liquidity: "AVAILABLE",
    }),
  );
  async function create(
    accountId: string,
    amountMinor: string,
    description: string,
    date = "2026-01-12",
  ) {
    return transactionSchema.parse(
      await mutate(`${base}/transactions`, {
        accountId,
        bookedDate: date,
        money: { amountMinor, currency: "GBP" },
        description,
      }),
    );
  }
  const transferOut = await create(
      current.id,
      "-50000",
      "Synthetic savings move",
    ),
    transferIn = await create(saving.id, "50000", "Synthetic savings arrival");
  const cardPurchase = await create(card.id, "-12000", "Synthetic groceries"),
    settleOut = await create(current.id, "-12000", "Synthetic card settlement"),
    settleIn = await create(card.id, "12000", "Synthetic card received");
  const mixed = await create(current.id, "-10000", "Synthetic mixed shop"),
    income = await create(current.id, "200000", "Synthetic income"),
    refund = await create(
      card.id,
      "3000",
      "Synthetic February refund",
      "2026-02-12",
    );
  await page.goto(`${origin}/activity/${transferOut.id}`);
  await page
    .getByRole("combobox", { name: "Other account", exact: true })
    .selectOption(saving.id);
  await page
    .getByRole("combobox", { name: "Matching entry", exact: true })
    .selectOption(transferIn.id);
  await expectMutation(page, `${base}/transfers/confirm`, "POST", () =>
    page.getByRole("button", { name: "Confirm transfer pair" }).click(),
  );
  await expect(
    page.getByRole("heading", { name: "Confirmed transfer", exact: true }),
  ).toBeVisible();
  const paired = transactionSchema.parse(
    await (
      await context.request.get(`${base}/transactions/${transferOut.id}`)
    ).json(),
  );
  if (!paired.transfer?.id) throw new Error("Expected owner-visible pair id");
  await expectMutation(
    page,
    `${base}/transfers/${paired.transfer.id}`,
    "DELETE",
    () =>
      page
        .getByRole("button", { name: "Remove transfer pair", exact: true })
        .click(),
  );
  await expect(
    page.getByRole("heading", { name: "Link a transfer", exact: true }),
  ).toBeVisible();
  await page.goto(`${origin}/activity/${transferIn.id}`);
  await page
    .getByRole("combobox", { name: "Other account", exact: true })
    .selectOption(current.id);
  await page
    .getByRole("combobox", { name: "Matching entry", exact: true })
    .selectOption(transferOut.id);
  await expectMutation(page, `${base}/transfers/confirm`, "POST", () =>
    page
      .getByRole("button", { name: "Confirm transfer pair", exact: true })
      .click(),
  );
  await expect(
    page.getByRole("heading", { name: "Confirmed transfer", exact: true }),
  ).toBeVisible();

  await mutate(`${base}/transfers/confirm`, {
    fromTransactionId: settleOut.id,
    toTransactionId: settleIn.id,
    fromVersion: settleOut.version,
    toVersion: settleIn.version,
  });
  async function classify(
    t: TransactionResponse,
    kind: string,
    category: string | null,
  ) {
    return transactionSchema.parse(
      await mutate(
        `${base}/transactions/${t.id}/annotation`,
        { classificationKind: kind, category },
        "PATCH",
        t.version,
      ),
    );
  }
  await classify(cardPurchase, "EXPENSE", "Groceries");
  await classify(income, "INCOME", null);
  await classify(refund, "REFUND", "Groceries");
  await page.goto(`${origin}/activity/${mixed.id}`);
  const split = page
    .getByRole("heading", { name: "Split across categories" })
    .locator("..");
  await split
    .getByRole("group", { name: "Split component 1", exact: true })
    .getByLabel("Category", { exact: true })
    .fill("Groceries");
  await split
    .getByRole("group", { name: "Split component 1", exact: true })
    .getByLabel("Signed amount · GBP")
    .fill("-60.00");
  await split
    .getByRole("group", { name: "Split component 2", exact: true })
    .getByLabel("Category", { exact: true })
    .fill("Travel");
  await split
    .getByRole("group", { name: "Split component 2", exact: true })
    .getByLabel("Signed amount · GBP")
    .fill("-40.00");
  await expectMutation(
    page,
    `${base}/transactions/${mixed.id}/splits`,
    "PUT",
    () => page.getByRole("button", { name: "Save split", exact: true }).click(),
  );
  const debtMixed = await create(
    current.id,
    "-10000",
    "Synthetic mixed principal payment",
    "2026-03-12",
  );
  await mutate(
    `${base}/transactions/${debtMixed.id}/splits`,
    {
      lines: [
        {
          category: "Principal",
          money: { amountMinor: "-8000", currency: "GBP" },
          classificationKind: "PRINCIPAL",
        },
        {
          category: "Interest",
          money: { amountMinor: "-2000", currency: "GBP" },
          classificationKind: "EXPENSE",
        },
      ],
    },
    "PUT",
    debtMixed.version,
  );
  await page.goto(`${origin}/dashboard?month=2026-01`);
  await expect(
    page.getByRole("heading", { name: "£220.00", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("table", { name: "Category spending, including refunds" }),
  ).toBeVisible();
  await expect(
    page.getByRole("table", { name: "Monthly cash flow" }),
  ).toBeVisible();
  await expect(
    page.getByText(
      "History has not been confirmed for every selected account.",
    ),
  ).toBeVisible();
  await capture(page, "spending-dashboard");
  const scopeControl = page.getByRole("region", { name: "Report scope" });
  await scopeControl.locator("summary").click();
  await scopeControl
    .getByRole("checkbox", { name: "All available accounts", exact: true })
    .uncheck();
  await scopeControl
    .getByRole("checkbox", { name: /Synthetic card/ })
    .uncheck();
  await scopeControl
    .getByRole("checkbox", { name: /Synthetic savings/ })
    .uncheck();
  await scopeControl
    .getByRole("checkbox", { name: /Synthetic everyday/ })
    .click();
  await expect(
    scopeControl.getByRole("checkbox", { name: /Synthetic everyday/ }),
  ).toBeChecked();
  await expect(
    page
      .getByRole("alert")
      .filter({ hasText: "Keep at least one account selected" }),
  ).toContainText("Keep at least one account selected");
  await scopeControl
    .getByRole("checkbox", { name: "All available accounts", exact: true })
    .check();
  await expect(
    page.getByRole("heading", { name: "£220.00", exact: true }),
  ).toBeVisible();
  await scopeControl.locator("summary").click();
  for (let i = 0; i < 3; i++) {
    await page
      .getByRole("button", { name: "Confirm whole-month history", exact: true })
      .first()
      .click();
    await expect(
      page.getByRole("button", {
        name: "Mark history incomplete",
        exact: true,
      }),
    ).toHaveCount(i + 1);
  }
  await expect(
    page.getByText("Ready to review together", { exact: true }),
  ).toBeVisible();
  const january = spendingReportSchema.parse(
    await (
      await context.request.get(`${base}/reports/spending?month=2026-01`)
    ).json(),
  );
  expect(january.summary?.spending.amountMinor).toBe("22000");
  expect(january.summary?.income.amountMinor).toBe("200000");
  expect(january.coverage.complete).toBe(true);
  await page.goto(`${origin}/budgets?month=2026-01`);
  await page
    .getByRole("group", { name: "Budget category 1", exact: true })
    .getByLabel("Category", { exact: true })
    .fill("Groceries");
  await page.getByLabel("Monthly limit · GBP", { exact: true }).fill("200.00");
  await expectMutation(page, `${base}/budgets/2026-01`, "PUT", () =>
    page.getByRole("button", { name: "Save monthly budget" }).click(),
  );
  await expect(
    page.getByRole("table", {
      name: "Budget and refund-adjusted actuals · 2026-01",
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("row", {
      name: "Groceries £200.00 £180.00 £20.00",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", {
      name: "Category plans at a glance",
      exact: true,
    }),
  ).toBeVisible();
  await capture(page, "monthly-budget");
  await page.goto(`${origin}/review?month=2026-02`);
  await expect(
    page.getByRole("heading", { name: "-£30.00", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Cash movement bridge" }),
  ).toBeVisible();
  await capture(page, "monthly-review");
  await page.goto(`${origin}/activity?account=${card.id}&month=2026-01`);
  await page.getByRole("button", { name: "Apply activity filters" }).click();
  await expect(
    page.getByRole("heading", {
      name: "Synthetic February refund",
      exact: true,
    }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "Synthetic groceries", exact: true }),
  ).toBeVisible();
  // Join through the real invitation flow and prove a downgrade clears the report.
  const memberContext = await browser.newContext({ baseURL: origin });
  try {
    const memberPage = await memberContext.newPage();
    await page.goto(`${origin}/household`);
    await page
      .getByLabel("Their email address")
      .fill(monthlyUsers().member.email);
    await page.getByRole("button", { name: "Create invitation link" }).click();
    const invitation = await page
      .getByLabel("Private invitation link")
      .inputValue();
    await memberPage.goto(invitation);
    await memberPage.getByRole("link", { name: "Sign in to continue" }).click();
    await memberPage
      .getByLabel("Email address")
      .fill(monthlyUsers().member.email);
    await memberPage
      .getByLabel(/^Password/)
      .fill(monthlyUsers().member.password);
    await memberPage.getByRole("button", { name: "Sign in" }).click();
    await memberPage.getByRole("button", { name: "Accept invitation" }).click();
    await expect(
      memberPage.getByRole("heading", { name: "You're part of the household" }),
    ).toBeVisible();
    const memberMe = meResponseSchema.parse(
      await (await memberContext.request.get("/api/me")).json(),
    );
    if (!memberMe.membership) throw new Error("Expected member");
    for (const a of [current, saving, card])
      await mutate(
        `${base}/accounts/${a.id}/grants/${memberMe.membership.id}`,
        { level: "TRANSACTIONS" },
        "PUT",
        0,
      );
    await memberPage.goto(`${origin}/activity/${mixed.id}`);
    await expect(
      memberPage.getByRole("table", { name: "How this transaction is split" }),
    ).toBeVisible();
    await expect(
      memberPage.getByRole("row", {
        name: "Groceries Expense -£60.00",
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      memberPage.getByRole("row", {
        name: "Travel Expense -£40.00",
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      memberPage.getByRole("button", { name: "Save split", exact: true }),
    ).toHaveCount(0);
    await memberPage.goto(`${origin}/activity/${debtMixed.id}`);
    await expect(
      memberPage.getByText("Split transaction · 2 components", { exact: true }),
    ).toBeVisible();
    await expect(
      memberPage.getByRole("row", {
        name: "Principal Principal -£80.00",
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      memberPage.getByRole("row", {
        name: "Interest Expense -£20.00",
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      memberPage.getByText("Expense · Reviewed", { exact: true }),
    ).toHaveCount(0);
    await memberPage.goto(
      `${origin}/activity?account=${current.id}&month=2026-03`,
    );
    await expect(
      memberPage.getByRole("heading", {
        name: "Synthetic mixed principal payment",
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      memberPage.getByText("Split transaction · 2 components", { exact: true }),
    ).toBeVisible();
    const scope = [current.id, saving.id, card.id].sort().join(",");
    await memberPage.goto(
      `${origin}/dashboard?month=2026-01&accountIds=${scope}`,
    );
    await expect(
      memberPage.getByRole("heading", { name: "£220.00", exact: true }),
    ).toBeVisible();
    await memberPage.goto(
      `${origin}/budgets?month=2026-01&accountIds=${scope}`,
    );
    await expect(
      memberPage.getByRole("table", {
        name: "Budget and refund-adjusted actuals · 2026-01",
      }),
    ).toBeVisible();
    const fresh = accountSchema.parse(
      await (await context.request.get(`${base}/accounts/${card.id}`)).json(),
    );
    const grant = fresh.sharing;
    if (!grant) throw new Error("Expected grant");
    await mutate(
      `${base}/accounts/${card.id}/grants/${memberMe.membership.id}`,
      { level: "TOTALS" },
      "PUT",
      grant.version,
    );
    const deniedSave = memberPage.waitForResponse(
      (response) =>
        response.url() === `${origin}${base}/budgets/2026-01` &&
        response.request().method() === "PUT",
    );
    await memberPage
      .getByRole("button", { name: "Save monthly budget", exact: true })
      .click();
    expect((await deniedSave).status()).toBe(404);
    await expect(
      memberPage.getByRole("table", {
        name: "Budget and refund-adjusted actuals · 2026-01",
      }),
    ).toHaveCount(0);
    const deniedGrant = accountSchema.parse(
      await (await context.request.get(`${base}/accounts/${card.id}`)).json(),
    );
    if (!deniedGrant.sharing)
      throw new Error("Expected current sharing version");
    await mutate(
      `${base}/accounts/${card.id}/grants/${memberMe.membership.id}`,
      { level: "TRANSACTIONS" },
      "PUT",
      deniedGrant.sharing.version,
    );
    await memberPage.goto(
      `${origin}/dashboard?month=2026-01&accountIds=${scope}`,
    );
    await expect(
      memberPage.getByRole("heading", { name: "£220.00", exact: true }),
    ).toBeVisible();
    const restoredGrant = accountSchema.parse(
      await (await context.request.get(`${base}/accounts/${card.id}`)).json(),
    );
    if (!restoredGrant.sharing)
      throw new Error("Expected restored sharing version");
    await mutate(
      `${base}/accounts/${card.id}/grants/${memberMe.membership.id}`,
      { level: "TOTALS" },
      "PUT",
      restoredGrant.sharing.version,
    );
    await memberPage.evaluate(() => window.dispatchEvent(new Event("focus")));
    await expect(
      memberPage.getByRole("heading", { name: "£220.00", exact: true }),
    ).toHaveCount(0);
    await expect(
      memberPage
        .getByRole("alert")
        .filter({ hasText: "This account selection is no longer available" }),
    ).toBeVisible();
  } finally {
    await memberContext.close();
  }
  await page.goto(`${origin}/dashboard?month=2026-01`);
  await expect(
    page.getByRole("heading", { name: "£220.00", exact: true }),
  ).toBeVisible();
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await page.evaluate(async () => {
    if (!navigator.serviceWorker.controller)
      await new Promise<void>((resolve) =>
        navigator.serviceWorker.addEventListener(
          "controllerchange",
          () => resolve(),
          { once: true },
        ),
      );
  });
  const cachesBefore = await page.evaluate(async () => {
    const result: string[] = [];
    for (const key of await caches.keys())
      for (const request of await (await caches.open(key)).keys())
        result.push(new URL(request.url).pathname);
    return result.sort();
  });
  expect(cachesBefore).toEqual(["/app-icon.svg", "/offline.html"]);
  expect(
    await page.evaluate(() => ({
      local: localStorage.length,
      session: sessionStorage.length,
    })),
  ).toEqual({ local: 0, session: 0 });
  await page.reload();
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("link", { name: "Skip to content" }),
  ).toBeFocused();
  await context.setOffline(true);
  await page.goto(`${origin}/review`).catch(() => undefined);
  await expect(
    page.getByRole("heading", { name: "A moment offline" }),
  ).toBeVisible();
  expect(await page.locator("body").innerText()).not.toContain("£220");
  expect(
    await page.evaluate(async () => {
      try {
        await fetch("/api/me");
        return true;
      } catch {
        return false;
      }
    }),
  ).toBe(false);
  await context.setOffline(false);
  await page.goto(`${origin}/household`);
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page).toHaveURL(`${origin}/sign-in`);
  expect(
    await page.evaluate(async () => {
      const cache = await caches.open("joint-static-shell-v1");
      return (await cache.keys()).map((r) => new URL(r.url).pathname).sort();
    }),
  ).toEqual(["/app-icon.svg", "/offline.html"]);
});
test("static offline shell never caches authentication or finance", async ({
  page,
  context,
}) => {
  await page.goto(origin);
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await expect
    .poll(() =>
      page.evaluate(() => Boolean(navigator.serviceWorker.controller)),
    )
    .toBe(true);
  await page.goto(`${origin}/sign-in`);
  await page.evaluate(async () => {
    await fetch("/api/auth/csrf", { cache: "no-store" });
    await fetch("/api/me", { cache: "no-store" });
  });
  expect(
    await page.evaluate(async () => {
      const paths: string[] = [];
      for (const name of await caches.keys())
        for (const req of await (await caches.open(name)).keys())
          paths.push(new URL(req.url).pathname);
      return paths.sort();
    }),
  ).toEqual(["/app-icon.svg", "/offline.html"]);
  await context.setOffline(true);
  await page.goto(`${origin}/dashboard`).catch(() => undefined);
  await expect(
    page.getByRole("heading", { name: "A moment offline" }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "Try again" })).toBeVisible();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Try again" })).toBeFocused();
  for (const width of [390, 1280, 320]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth,
      ),
    ).toBe(false);
  }
  expect(
    await page.evaluate(async () => {
      try {
        await fetch("/api/me");
        return true;
      } catch {
        return false;
      }
    }),
  ).toBe(false);
  await context.setOffline(false);
});
