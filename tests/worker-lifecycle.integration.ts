import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { expect, it, vi } from "vitest";
import { createFixtureOwner } from "./fixtures/database.js";

it("starts independently, leaves idle connections untouched and releases them on SIGTERM", async () => {
  if (!process.env.DATABASE_URL)
    throw new Error("Worker needs runtime configuration");
  const owner = createFixtureOwner();
  const name = `synthetic-worker-${randomUUID()}`;
  const connection = new URL(process.env.DATABASE_URL);
  connection.searchParams.set("application_name", name);
  const child = spawn(process.execPath, ["apps/worker/dist/main.js"], {
    env: {
      PATH: process.env.PATH,
      NODE_ENV: "test",
      DATABASE_URL: connection.toString(),
      WORKER_INTERVAL_MS: "1000",
      WORKER_RETRY_MAX_MS: "1000",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  child.stdout.on("data", (data: Buffer) => {
    output += data.toString();
  });
  child.stderr.on("data", (data: Buffer) => {
    output += data.toString();
  });
  const exited = new Promise<number | null>((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", resolve);
  });
  try {
    await vi.waitFor(() => expect(output).toContain("Worker database ready"), {
      timeout: 4000,
    });
    const snapshots = () => owner.$queryRaw<
      { pid: number; changed: Date; state: string }[]
    >`
      SELECT pid, state_change AS changed, state FROM pg_stat_activity WHERE application_name = ${name} ORDER BY pid
    `;
    await vi.waitFor(async () => {
      const rows = await snapshots();
      expect(rows.length).toBeGreaterThan(0);
      expect(rows.every((row) => row.state === "idle")).toBe(true);
    });
    await delay(100);
    const before = await snapshots();
    await delay(1200);
    expect(await snapshots()).toEqual(before);
    expect(output).not.toContain("unavailable");
    child.kill("SIGTERM");
    expect(await exited).toBe(0);
    expect(await snapshots()).toEqual([]);
    expect(output).not.toContain(connection.password);
  } finally {
    if (child.exitCode === null && child.signalCode === null)
      child.kill("SIGTERM");
    await exited;
    await owner.$disconnect();
  }
});
