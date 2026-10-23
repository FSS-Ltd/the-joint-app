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
    expect((await fetch(`${url}/health/ready`)).status).toBe(503);
    expect((await fetch(`${url}/v1/bootstrap`)).status).toBe(401);
    expect(await (await fetch(`${url}/health/live`)).json()).toEqual({
      status: "ok",
    });
  } finally {
    await app.close();
  }
});
