import { expect, it } from "vitest";
import { createDatabase } from "../packages/database/dist/index.js";
import { createApplication } from "../apps/api/dist/application.js";
it("checks real connectivity and keeps liveness independent of database failure", async () => {
  const database = createDatabase(
    process.env.DATABASE_URL ??
      "postgresql://joint:local-development-only@127.0.0.1:5432/joint",
    500,
  );
  const app = await createApplication(database);
  await app.listen(0, "127.0.0.1");
  try {
    const url = await app.getUrl();
    expect((await fetch(`${url}/health/ready`)).status).toBe(200);
    await database.close();
    const unavailable = await fetch(`${url}/health/ready`);
    expect(unavailable.status).toBe(503);
    expect(await unavailable.json()).toEqual({ status: "unavailable" });
    expect((await fetch(`${url}/v1/bootstrap`)).status).toBe(401);
    expect(await (await fetch(`${url}/health/live`)).json()).toEqual({
      status: "ok",
    });
  } finally {
    await app.close();
  }
});

it("redacts malformed and oversized identity request bodies", async () => {
  const database = createDatabase(
    process.env.DATABASE_URL ??
      "postgresql://joint:local-development-only@127.0.0.1:5432/joint",
    500,
  );
  const app = await createApplication(database);
  try {
    await app.listen(0, "127.0.0.1");
    const url = `${await app.getUrl()}/v1/auth/login`;
    const secret = "synthetic-password-not-for-response";
    for (const [body, status] of [
      [`{"password":"${secret}", BROKEN}`, 400],
      [JSON.stringify({ password: secret.repeat(1500) }), 413],
    ] as const) {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
      });
      expect(response.status).toBe(status);
      const text = await response.text();
      expect(text).not.toContain(secret);
      expect(text).not.toContain("SyntaxError");
      expect(response.headers.get("cache-control")).toContain("no-store");
    }
  } finally {
    await app.close();
    await database.close();
  }
});
