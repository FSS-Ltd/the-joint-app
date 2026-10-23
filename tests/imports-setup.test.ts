import { randomBytes } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { expect, it } from "vitest";
import { csvSourceIdentity } from "../apps/worker/src/imports/preview.js";
import { DataVault } from "../packages/database/src/data-vault.js";

const script = resolve("scripts/imports-setup.mjs");
it("encrypts bytes with random nonces and binds the original to its import", () => {
  const vault = new DataVault(randomBytes(32).toString("base64"));
  const bytes = Buffer.from(
    'date,description,amount\n2026-01-01,"Private text",12.34',
  );
  const first = vault.seal(bytes, "import:one");
  expect(first).not.toContain("Private text");
  expect(first).not.toBe(vault.seal(bytes, "import:one"));
  expect(Buffer.from(vault.open(first, "import:one"))).toEqual(bytes);
  expect(() => vault.open(first, "import:other")).toThrow(
    "Stored import data unavailable",
  );
  expect(() =>
    vault.open(`${first.slice(0, -8)}AAAAAAAA`, "import:one"),
  ).toThrow("Stored import data unavailable");
  expect(() => new DataVault("invalid secret value")).toThrow(
    "Invalid import encryption configuration",
  );
});
it("creates a private local key and preserves valid existing settings", async () => {
  const directory = await mkdtemp(join(tmpdir(), "joint-import-setup-"));
  try {
    const output = execFileSync(process.execPath, [script], {
      cwd: directory,
      encoding: "utf8",
    });
    const path = join(directory, ".env.imports");
    const original = await readFile(path, "utf8");
    expect(original).toMatch(/^IMPORT_DATA_KEY=[A-Za-z0-9+/]{43}=\n$/);
    expect(output).not.toContain(original.split("=").slice(1).join("="));
    expect((await stat(path)).mode & 0o777).toBe(0o600);
    execFileSync(process.execPath, [script], { cwd: directory });
    expect(await readFile(path, "utf8")).toBe(original);
    await writeFile(path, "IMPORT_DATA_KEY=private-invalid-value\n");
    expect(() =>
      execFileSync(process.execPath, [script], {
        cwd: directory,
        stdio: "pipe",
      }),
    ).toThrow();
    expect(await readFile(path, "utf8")).toBe(
      "IMPORT_DATA_KEY=private-invalid-value\n",
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

it("separates provider source IDs from file-row fallback identities", () => {
  const checksum = "a".repeat(64);
  const fallback = csvSourceIdentity(checksum, {
    sourceId: null,
    rowNumber: 1,
  });
  const chosen = csvSourceIdentity(checksum, {
    sourceId: fallback,
    rowNumber: 1,
  });
  expect(fallback).toBe(`file:${checksum}:1`);
  expect(chosen).toMatch(/^id:[a-f0-9]{64}$/);
  expect(chosen).not.toBe(fallback);
  expect(
    csvSourceIdentity(checksum, { sourceId: fallback, rowNumber: 2 }),
  ).toBe(chosen);
});

it("rejects invalid worker import configuration without printing secret values", () => {
  const secret = "synthetic-value-that-must-never-be-printed";
  try {
    execFileSync(
      process.execPath,
      ["--import", "tsx", resolve("apps/worker/src/main.ts")],
      {
        encoding: "utf8",
        env: {
          ...process.env,
          DATABASE_URL:
            "postgresql://joint:synthetic-password@127.0.0.1:5432/joint",
          IMPORT_DATA_KEY: secret,
        },
        stdio: "pipe",
      },
    );
    throw new Error("Expected invalid import configuration to fail");
  } catch (error) {
    if (!error || typeof error !== "object" || !("stderr" in error))
      throw error;
    const output = String(error.stderr);
    expect(output).toContain("IMPORT_DATA_KEY");
    expect(output).not.toContain(secret);
    expect(output).not.toContain("synthetic-password");
  }
});
