import { randomBytes } from "node:crypto";
import { Buffer } from "node:buffer";
import process from "node:process";
import { chmod, readFile, writeFile } from "node:fs/promises";

async function setup() {
  let existing;
  try {
    existing = await readFile(".env.imports", "utf8");
  } catch (error) {
    if (
      !error ||
      typeof error !== "object" ||
      !("code" in error) ||
      error.code !== "ENOENT"
    )
      throw error;
  }
  if (existing !== undefined) {
    const match = /^IMPORT_DATA_KEY=([A-Za-z0-9+/]{43}=)\n?$/.exec(existing);
    const key = match?.[1];
    if (
      !key ||
      Buffer.from(key, "base64").length !== 32 ||
      Buffer.from(key, "base64").toString("base64") !== key
    )
      throw new Error(
        "Invalid local import settings; restore the original IMPORT_DATA_KEY before proceeding.",
      );
    await chmod(".env.imports", 0o600);
    process.stdout.write(
      "Existing local import encryption settings preserved.\n",
    );
    return;
  }
  await writeFile(
    ".env.imports",
    `IMPORT_DATA_KEY=${randomBytes(32).toString("base64")}\n`,
    { mode: 0o600, flag: "wx" },
  );
  process.stdout.write(
    "Local import encryption settings created in ignored .env.imports. No credentials printed.\n",
  );
}
setup().catch(() => {
  process.stderr.write(
    "Local import encryption setup failed. Check .env.imports permissions and restore its original valid IMPORT_DATA_KEY; existing settings were not replaced.\n",
  );
  process.exitCode = 1;
});
