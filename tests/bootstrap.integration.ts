import { randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import { createDatabase } from "../packages/database/dist/index.js";
import { createOrm } from "../packages/database/dist/client.js";
import { createApplication } from "../apps/api/dist/application.js";
import { startIdentityFixture } from "./fixtures/identity.js";

it("verifies identity, resolves household from DB and rejects revoked or forged sessions", async () => {
  const connectionString =
    process.env.DATABASE_URL ??
    "postgresql://joint:local-development-only@127.0.0.1:5432/joint";
  const database = createOrm(connectionString);
  const health = createDatabase(connectionString, 500);
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
            user: { create: { id: userId } },
            slot: 1,
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
    await app.listen(0, "127.0.0.1");
    const url = `${await app.getUrl()}/v1/bootstrap`;
    expect((await fetch(url)).status).toBe(401);
    const token = await identity.token(userId, sessionId, {
      householdId: randomUUID(),
    });
    const request = (value: string) =>
      fetch(url, { headers: { authorization: `Bearer ${value}` } });
    const accepted = await request(token);
    expect(accepted.status).toBe(200);
    expect(accepted.headers.get("cache-control")).toContain("no-store");
    expect(await accepted.json()).toEqual({ status: "ok", householdId });
    expect((await request(`${token}forged`)).status).toBe(401);
    expect(
      (await request(await identity.token(randomUUID(), sessionId))).status,
    ).toBe(401);
    expect(
      (await request(await identity.token(userId, randomUUID()))).status,
    ).toBe(401);
    for (const overrides of [
      { iss: "https://untrusted.invalid" },
      { aud: "anon" },
      { exp: 1 },
      { role: "service_role" },
    ])
      expect(
        (await request(await identity.token(userId, sessionId, overrides)))
          .status,
      ).toBe(401);
    await database.sessionRegistry.update({
      where: { id: sessionId },
      data: { expiresAt: new Date(0) },
    });
    expect((await request(token)).status).toBe(401);
    await database.sessionRegistry.update({
      where: { id: sessionId },
      data: { expiresAt: new Date(Date.now() + 60_000), revokedAt: new Date() },
    });
    expect((await request(token)).status).toBe(401);
  } finally {
    await app.close();
    await database.household.deleteMany({ where: { id: householdId } });
    await database.user.deleteMany({ where: { id: userId } });
    await database.$disconnect();
    await health.close();
    await identity.close();
  }
});
