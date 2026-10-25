import { randomUUID, randomBytes, createHash } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { meResponseSchema } from "../../packages/contracts/dist/index.js";
import {
  database,
  households,
  statusOrigin as origin,
  privacyUsers,
  signIn,
  startStatusBrowser,
  stopPrivacyBrowser,
} from "../fixtures/privacy-browser.js";

test.use({ baseURL: origin });
test.beforeAll(startStatusBrowser);
test.afterAll(stopPrivacyBrowser);

async function watch(page: Page, path: string, id: string): Promise<void> {
  await page.evaluate(
    ({ path, id }) => {
      const output = document.createElement("output");
      output.id = id;
      output.setAttribute("aria-live", "polite");
      document.body.append(output);
      const source = new EventSource(path);
      let changes = 0;
      source.addEventListener("change", (event) => {
        output.textContent = String(++changes);
        output.dataset.payload =
          event instanceof MessageEvent ? String(event.data) : "invalid";
      });
      source.addEventListener("invalidate", () => {
        output.dataset.invalidated = "true";
        source.close();
      });
      output.addEventListener("close", () => source.close(), { once: true });
      window.addEventListener("pagehide", () => source.close(), { once: true });
    },
    { path, id },
  );
}

test("native browser streams cross the real BFF with HttpOnly credentials and receipt isolation", async ({
  page,
  context,
}) => {
  await signIn(page, privacyUsers().owner);
  await page.getByLabel("Household name").fill("Synthetic streaming household");
  await page.getByRole("button", { name: "Create household" }).click();
  await expect(
    page.getByRole("heading", { name: "Your household is ready" }),
  ).toBeVisible();
  const identity = meResponseSchema.parse(
    await (await context.request.get("/api/me")).json(),
  );
  const membership = identity.membership;
  if (!membership) throw new Error("Fixture household unavailable");
  households.push(membership.householdId);
  const accountId = randomUUID(),
    batchId = randomUUID();
  await database.account.create({
    data: {
      id: accountId,
      householdId: membership.householdId,
      creatorUserId: identity.user.id,
      creatorMembershipId: membership.id,
      kind: "CURRENT",
      label: "Synthetic stream",
      owners: {
        create: { userId: identity.user.id, membershipId: membership.id },
      },
    },
  });
  await database.importBatch.create({
    data: {
      id: batchId,
      householdId: membership.householdId,
      accountId,
      requestedByUserId: identity.user.id,
      requestedByMembershipId: membership.id,
      fileChecksum: "a".repeat(64),
      mappingHash: "b".repeat(64),
      mapping: {},
      parserVersion: "1",
      previewExpiresAt: new Date(Date.now() + 60000),
    },
  });
  await page.goto(`/imports/${batchId}`);
  await expect(
    page.getByRole("heading", { name: "Queued", exact: true }),
  ).toBeVisible();
  const query = new URLSearchParams({
    kind: "import",
    id: batchId,
    householdId: membership.householdId,
  });
  await watch(page, `/api/events?${query}`, "status-probe");
  const output = page.locator("#status-probe");
  try {
    await expect(output).toHaveText("1");
    await expect(output).toHaveAttribute("data-payload", "{}");
    await database.importBatch.update({
      where: { id: batchId },
      data: { state: "READY", version: { increment: 1 } },
    });
    await expect(output).toHaveText("2");
    await expect(
      page.getByRole("heading", { name: "Ready for review", exact: true }),
    ).toBeVisible();
    await database.accountOwner.update({
      where: { accountId_userId: { accountId, userId: identity.user.id } },
      data: { status: "ARCHIVED" },
    });
    await expect(output).toHaveAttribute("data-invalidated", "true");
    await expect(
      page.getByRole("region", { name: "Import overview", exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("region", { name: "Source row review", exact: true }),
    ).toHaveCount(0);
    expect(await page.evaluate(() => document.cookie)).not.toContain(
      "joint-session",
    );

    const receiptUser = randomUUID(),
      receiptId = randomUUID(),
      token = randomBytes(32).toString("base64url");
    await database.user.create({ data: { id: receiptUser } });
    try {
      await database.deletionRequest.create({
        data: {
          id: receiptId,
          userId: receiptUser,
          statusTokenHash: createHash("sha256").update(token).digest("hex"),
          statusExpiresAt: new Date(Date.now() + 60000),
        },
      });
      await context.addCookies([
        {
          name: "joint-deletion-receipt",
          value: `${receiptId}.${token}`,
          domain: "127.0.0.1",
          path: "/api/privacy",
          httpOnly: true,
          sameSite: "Strict",
          secure: false,
        },
      ]);
      await context.clearCookies({ name: "joint-session" });
      await watch(
        page,
        `/api/privacy/deletion-requests/${receiptId}/events`,
        "receipt-probe",
      );
      const receipt = page.locator("#receipt-probe");
      await expect(receipt).toHaveText("1");
      await expect(receipt).toHaveAttribute("data-payload", "{}");
      expect((await context.request.get("/api/me")).status()).toBe(401);
      await database.deletionRequest.update({
        where: { id: receiptId },
        data: { statusExpiresAt: new Date(Date.now() - 1) },
      });
      await expect(receipt).toHaveAttribute("data-invalidated", "true");
    } finally {
      await page.evaluate(() =>
        document
          .getElementById("receipt-probe")
          ?.dispatchEvent(new Event("close")),
      );
      await database.deletionRequest.deleteMany({
        where: { userId: receiptUser },
      });
      await database.user.delete({ where: { id: receiptUser } });
    }
  } finally {
    await page.evaluate(() =>
      document
        .getElementById("status-probe")
        ?.dispatchEvent(new Event("close")),
    );
    await database.importBatch.deleteMany({
      where: { householdId: membership.householdId },
    });
  }
});
