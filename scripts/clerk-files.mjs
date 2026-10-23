import process from "node:process";
import { constants } from "node:fs";
import { open, mkdir, lstat } from "node:fs/promises";
import { parseEnv } from "node:util";
import { resolve } from "node:path";

export async function readSettings(path) {
  let file;
  try {
    file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
    const stat = await file.stat();
    if (
      !stat.isFile() ||
      stat.uid !== process.getuid() ||
      stat.size > 65536 ||
      (path !== ".env" && stat.mode & 0o077)
    )
      throw new Error();
    return parseEnv(await file.readFile("utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") return {};
    throw new Error("Check local environment file ownership and permissions", {
      cause: error,
    });
  } finally {
    await file?.close();
  }
}
export async function privateFile(path, content) {
  const file = await open(
    path,
    constants.O_WRONLY |
      constants.O_CREAT |
      constants.O_EXCL |
      constants.O_NOFOLLOW,
    0o600,
  );
  try {
    await file.writeFile(content);
    await file.sync();
  } finally {
    await file.close();
  }
}
async function privateDirectory(path) {
  try {
    await mkdir(path, { mode: 0o700 });
  } catch (error) {
    if (error?.code !== "EEXIST") throw error;
  }
  const stat = await lstat(path);
  if (!stat.isDirectory() || stat.uid !== process.getuid() || stat.mode & 0o077)
    throw new Error("Private local directory required");
}
export async function ensurePrivacyJournal() {
  await privateDirectory(".local");
  await privateDirectory(".local/privacy");
  const journal = resolve(".local/privacy/deletion-ledger.ndjson");
  try {
    await privateFile(journal, "");
  } catch (error) {
    if (error?.code !== "EEXIST") throw error;
  }
  const file = await open(journal, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const stat = await file.stat();
    if (!stat.isFile() || stat.uid !== process.getuid() || stat.mode & 0o077)
      throw new Error("Private existing journal required");
  } finally {
    await file.close();
  }
  if (!Object.keys(await readSettings(".env.privacy")).length)
    await privateFile(
      ".env.privacy",
      `PRIVACY_JOURNAL_PATH=${JSON.stringify(journal)}\n`,
    );
}
