import { spawn } from "node:child_process";
import { once } from "node:events";
import { expect, it } from "vitest";

it("worker releases database handles on SIGTERM", async () => {
  const child = spawn(process.execPath, ["apps/worker/dist/main.js"], {
    env: {
      ...process.env,
      DATABASE_URL:
        process.env.DATABASE_URL ??
        "postgresql://joint:local-development-only@127.0.0.1:5432/joint",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  try {
    const exited = once(child, "exit");
    await once(child.stdout, "data");
    child.kill("SIGTERM");
    const [code, signal] = await exited;
    expect(code).toBe(0);
    expect(signal).toBeNull();
  } finally {
    if (child.exitCode === null) child.kill("SIGKILL");
  }
});

for (const service of ["api", "worker"])
  it(`${service} rejects invalid configuration without leaking input`, async () => {
    const sentinel = "synthetic-secret-do-not-log";
    const child = spawn(process.execPath, [`apps/${service}/dist/main.js`], {
      env: { ...process.env, DATABASE_URL: sentinel },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    child.stderr.on("data", (chunk) => {
      output += String(chunk);
    });
    const [code] = await once(child, "exit");
    expect(code).toBe(1);
    expect(output).toContain("Invalid environment fields: DATABASE_URL");
    expect(output).not.toContain(sentinel);
  });

it("migration command rejects invalid configuration without echoing credentials", async () => {
  const sentinel = "synthetic-secret-do-not-log";
  const child = spawn(process.execPath, ["scripts/database.mjs", "migrate"], {
    env: { ...process.env, MIGRATION_DATABASE_URL: sentinel },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  child.stderr.on("data", (chunk) => {
    output += String(chunk);
  });
  const [code] = await once(child, "exit");
  expect(code).toBe(1);
  expect(output).toContain(
    "Invalid environment fields: MIGRATION_DATABASE_URL",
  );
  expect(output).not.toContain(sentinel);
});
