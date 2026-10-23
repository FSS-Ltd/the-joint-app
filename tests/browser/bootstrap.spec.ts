import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { createApplication } from "../../apps/api/dist/application.js";
import { createDatabase } from "../../packages/database/dist/index.js";
import { createOrm } from "../../packages/database/dist/client.js";
import { startIdentityFixture } from "../fixtures/identity.js";

test("web forwards its HttpOnly session to the API without trusting client household IDs", async ({
  context,
  page,
}) => {
  const connection =
    process.env.DATABASE_URL ??
    "postgresql://joint:local-development-only@127.0.0.1:5432/joint";
  const database = createOrm(connection);
  const health = createDatabase(connection, 500);
  const identity = await startIdentityFixture();
  const householdId = randomUUID();
  const userId = randomUUID();
  const sessionId = randomUUID();
  const app = await createApplication(health, {
    database,
    issuer: identity.issuer,
  });
  try {
    await database.household.create({
      data: {
        id: householdId,
        memberships: {
          create: {
            userId,
            sessions: {
              create: {
                id: sessionId,
                expiresAt: new Date(Date.now() + 60_000),
              },
            },
          },
        },
      },
    });
    await app.listen(3001, "127.0.0.1");
    expect((await context.request.get("/api/bootstrap")).status()).toBe(401);
    await context.addCookies([
      {
        name: "joint-access",
        value: await identity.token(userId, sessionId),
        url: "http://127.0.0.1:3000",
        httpOnly: true,
        sameSite: "Lax",
        secure: false,
      },
    ]);
    await page.goto("/");
    expect(await page.evaluate(() => document.cookie)).not.toContain(
      "joint-access",
    );
    const response = await context.request.get(
      `/api/bootstrap?householdId=${randomUUID()}`,
    );
    expect(response.status()).toBe(200);
    expect(response.headers()["cache-control"]).toContain("no-store");
    expect(await response.json()).toEqual({ status: "ok", householdId });
    await database.sessionRegistry.update({
      where: { id: sessionId },
      data: { revokedAt: new Date() },
    });
    expect((await context.request.get("/api/bootstrap")).status()).toBe(401);
  } finally {
    await app.close();
    await database.household.deleteMany({ where: { id: householdId } });
    await database.$disconnect();
    await health.close();
    await identity.close();
  }
});
