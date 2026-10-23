import { randomUUID } from "node:crypto";
import { expect, it, vi } from "vitest";
import { createApplication } from "../apps/api/src/application.js";
import { createOrm } from "../packages/database/dist/client.js";
import { JobsRepository } from "../packages/database/dist/jobs.repository.js";
import { runJobs } from "../apps/worker/src/job-runner.js";
import { createFixtureOwner } from "./fixtures/database.js";

it("logs API correlation without supplied authorization, cookies, query tokens or request payloads", async () => {
  const sentinel = "synthetic-private-token-and-finance-sentinel";
  let output = "";
  const captured = vi
    .spyOn(process.stderr, "write")
    .mockImplementation((chunk) => {
      output += String(chunk);
      return true;
    });
  const app = await createApplication({
    ready: async () => true,
    close: async () => {},
  });
  try {
    await app.listen(0, "127.0.0.1");
    const response = await fetch(
      `${await app.getUrl()}/v1/auth/login?token=${sentinel}`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${sentinel}`,
          cookie: `private=${sentinel}`,
        },
        body: JSON.stringify({
          email: "synthetic@example.test",
          password: sentinel,
        }),
      },
    );
    expect(response.status).toBe(503);
    const requestId = response.headers.get("x-request-id");
    expect(requestId).toMatch(/^[a-f0-9-]{36}$/);
    expect(output).toContain(String(requestId));
    expect(output).toContain("API_REQUEST_REJECTED");
    expect(output).not.toContain(sentinel);
    expect(JSON.stringify(await response.json())).not.toContain(sentinel);
  } finally {
    await app.close();
    captured.mockRestore();
  }
});

it("logs only the leased job identifier after a worker throws financial and token payload", async () => {
  if (!process.env.DATABASE_URL) throw new Error("Local database is required");
  const runtime = createOrm(process.env.DATABASE_URL),
    maintenance = createFixtureOwner();
  const householdId = randomUUID(),
    type = `synthetic.redaction.${randomUUID()}`;
  const sentinel = "synthetic-worker-secret-and-financial-description";
  let output = "";
  const captured = vi
    .spyOn(process.stderr, "write")
    .mockImplementation((chunk) => {
      output += String(chunk);
      return true;
    });
  try {
    await maintenance.household.create({ data: { id: householdId } });
    const jobs = new JobsRepository(runtime);
    const job = await jobs.enqueue({
      householdId,
      type,
      resourceId: randomUUID(),
      idempotencyKey: randomUUID(),
      payload: { secret: sentinel },
    });
    expect(
      await runJobs(
        jobs,
        {
          [type]: async () => {
            throw new Error(sentinel);
          },
        },
        { owner: "synthetic-redaction", maxJobs: 1, budgetMs: 5000 },
      ),
    ).toEqual({ succeeded: 0, failed: 1 });
    expect(output).toContain(job.id);
    expect(output).toContain("WORKER_JOB_FAILED");
    expect(output).not.toContain(sentinel);
  } finally {
    captured.mockRestore();
    await maintenance.household.deleteMany({ where: { id: householdId } });
    await runtime.$disconnect();
    await maintenance.$disconnect();
  }
});
