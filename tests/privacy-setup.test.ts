import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, expect, it } from "vitest";

const paths: string[] = [];
afterEach(async () => {
  await Promise.all(
    paths.splice(0).map((path) => rm(path, { recursive: true })),
  );
});
async function fixture() {
  const cwd = await mkdtemp(join(tmpdir(), "joint-privacy-setup-"));
  paths.push(cwd);
  return cwd;
}
function setup(cwd: string, url = "http://127.0.0.1:15421/auth/v1") {
  return spawnSync(process.execPath, [resolve("scripts/privacy-setup.mjs")], {
    cwd,
    encoding: "utf8",
    env: {
      ...process.env,
      SUPABASE_AUTH_URL: url,
      SUPABASE_TEST_ADMIN_KEY: "SYNTHETIC_PRIVATE_ADMIN_SENTINEL",
    },
  });
}
it("creates private local journal settings and worker-only Auth credentials without printing them", async () => {
  const cwd = await fixture();
  const result = setup(cwd);
  expect(result.status).toBe(0);
  expect(result.stdout + result.stderr).not.toContain(
    "SYNTHETIC_PRIVATE_ADMIN_SENTINEL",
  );
  const api = await readFile(join(cwd, ".env.privacy"), "utf8");
  expect(api).toContain("PRIVACY_JOURNAL_PATH=");
  expect(api).not.toContain("ADMIN");
  const worker = await readFile(join(cwd, ".env.privacy-worker"), "utf8");
  expect(worker).toContain("PRIVACY_AUTH_ADMIN_KEY=");
  const ledger = join(cwd, ".local/privacy/deletion-ledger.ndjson");
  expect((await stat(ledger)).mode & 0o777).toBe(0o600);
  expect((await stat(join(cwd, ".local/privacy"))).mode & 0o777).toBe(0o700);
  await writeFile(ledger, "preserved\n");
  expect(setup(cwd).status).toBe(0);
  expect(await readFile(ledger, "utf8")).toBe("preserved\n");
  expect(await readFile(join(cwd, ".env.privacy-worker"), "utf8")).toBe(worker);
});
it("rejects hosted Auth and invalid existing settings without overwriting them", async () => {
  const cwd = await fixture();
  expect(setup(cwd, "https://hosted.invalid/auth/v1").status).toBe(1);
  const existing = "SYNTHETIC_PRIVATE_ADMIN_SENTINEL\n";
  await writeFile(join(cwd, ".env.privacy"), existing, { mode: 0o600 });
  const result = setup(cwd);
  expect(result.status).toBe(1);
  expect(result.stdout + result.stderr).not.toContain(
    "SYNTHETIC_PRIVATE_ADMIN_SENTINEL",
  );
  expect(await readFile(join(cwd, ".env.privacy"), "utf8")).toBe(existing);
});
