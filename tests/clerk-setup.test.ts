import { execFile } from "node:child_process";
import { generateKeyPairSync, randomBytes } from "node:crypto";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { parseEnv, promisify } from "node:util";
import { afterEach, expect, it } from "vitest";
const directories: string[] = [];
afterEach(async () => {
  for (const directory of directories.splice(0))
    await rm(directory, { recursive: true });
});
it("prepares private Clerk settings without overwriting keys, journal or provisioning an instance", async () => {
  const directory = await mkdtemp(join(tmpdir(), "joint-clerk-setup-"));
  directories.push(directory);
  const { publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const tokenKey = randomBytes(32).toString("base64"),
    hashKey = randomBytes(32).toString("base64");
  const secret = "sk_test_SYNTHETIC_SENTINEL_NOT_A_REAL_KEY";
  const base = `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_${Buffer.from("synthetic.clerk.accounts.dev$").toString("base64")}\nCLERK_SECRET_KEY=${secret}\n`;
  await writeFile(join(directory, ".env"), base, { mode: 0o600 });
  await writeFile(
    join(directory, ".env.auth"),
    `AUTH_TOKEN_KEY=${tokenKey}\nAUTH_EMAIL_HASH_KEY=${hashKey}\n`,
    { mode: 0o600 },
  );
  const stub = join(directory, "fetch.mjs");
  await writeFile(
    stub,
    `globalThis.fetch=async url=>{if(url!=='https://synthetic.clerk.accounts.dev/.well-known/jwks.json') throw Error('Unexpected network operation');return Response.json({keys:[${JSON.stringify(publicKey.export({ format: "jwk" }))}]});};`,
  );
  const execute = () =>
    promisify(execFile)(
      process.execPath,
      ["--import", stub, resolve("scripts/clerk-setup.mjs")],
      { cwd: directory, env: { PATH: process.env.PATH, NODE_ENV: "test" } },
    );
  const first = await execute();
  expect(first.stdout).not.toContain(secret);
  expect(first.stderr).toBe("");
  const saved = await readFile(join(directory, ".env.clerk"), "utf8");
  expect(parseEnv(saved)).toMatchObject({
    AUTH_PROVIDER: "clerk",
    AUTH_TOKEN_KEY: tokenKey,
    AUTH_EMAIL_HASH_KEY: hashKey,
    CLERK_ISSUER: "https://synthetic.clerk.accounts.dev",
  });
  expect(saved).not.toContain(secret);
  expect((await stat(join(directory, ".env.clerk"))).mode & 0o777).toBe(0o600);
  const journal = join(directory, ".local/privacy/deletion-ledger.ndjson");
  await writeFile(journal, "preserved-independent-journal\n");
  await execute();
  expect(await readFile(join(directory, ".env.clerk"), "utf8")).toBe(saved);
  expect(await readFile(join(directory, ".env"), "utf8")).toBe(base);
  expect(await readFile(journal, "utf8")).toBe(
    "preserved-independent-journal\n",
  );
});
