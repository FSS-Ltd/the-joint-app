import { constants } from "node:fs";
import { lstat, mkdir, open } from "node:fs/promises";
import { resolve } from "node:path";
import process from "node:process";
import { URL } from "node:url";

async function privateDirectory(path) {
  await mkdir(path, { mode: 0o700 });
}

async function ensureDirectory(path) {
  try {
    await privateDirectory(path);
  } catch (error) {
    if (error?.code !== "EEXIST") throw error;
  }
  const stat = await lstat(path);
  if (
    !stat.isDirectory() ||
    (stat.mode & 0o077) !== 0 ||
    stat.uid !== process.getuid()
  )
    throw new Error();
}

async function ensureFile(path, content, preserveContent = false) {
  let file;
  try {
    file = await open(
      path,
      constants.O_WRONLY |
        constants.O_CREAT |
        constants.O_EXCL |
        constants.O_NOFOLLOW,
      0o600,
    );
    await file.writeFile(content);
    await file.sync();
  } catch (error) {
    if (error?.code !== "EEXIST") throw error;
    file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
    const stat = await file.stat();
    if (
      !stat.isFile() ||
      (stat.mode & 0o077) !== 0 ||
      stat.uid !== process.getuid()
    )
      throw new Error("Invalid existing privacy file", { cause: error });
    if (!preserveContent && (await file.readFile("utf8")) !== content)
      throw new Error("Existing privacy settings differ", { cause: error });
  } finally {
    await file?.close();
  }
}

async function setup() {
  const authUrl = new URL(process.env.SUPABASE_AUTH_URL ?? "");
  const adminKey = process.env.SUPABASE_TEST_ADMIN_KEY;
  if (
    authUrl.protocol !== "http:" ||
    !["127.0.0.1", "localhost", "[::1]"].includes(authUrl.hostname) ||
    authUrl.username ||
    authUrl.password ||
    authUrl.search ||
    authUrl.hash ||
    !adminKey ||
    adminKey.length < 20 ||
    adminKey.length > 4096 ||
    /\s/.test(adminKey)
  )
    throw new Error();
  await ensureDirectory(resolve(".local"));
  await ensureDirectory(resolve(".local/privacy"));
  const journal = resolve(".local/privacy/deletion-ledger.ndjson");
  await ensureFile(
    ".env.privacy",
    `PRIVACY_JOURNAL_PATH=${JSON.stringify(journal)}\n`,
  );
  await ensureFile(
    ".env.privacy-worker",
    `PRIVACY_AUTH_URL=${authUrl.href}\nPRIVACY_AUTH_ADMIN_KEY=${adminKey}\n`,
  );
  await ensureFile(journal, "", true);
  process.stdout.write(
    "Local privacy journal and worker-only Auth settings ready. Existing ledger preserved; no credentials printed.\n",
  );
}
setup().catch(() => {
  process.stderr.write(
    "Local privacy setup failed. Run auth:setup first; check private file permissions and preserve existing journal/settings. Hosted Auth is not supported by this local helper.\n",
  );
  process.exitCode = 1;
});
