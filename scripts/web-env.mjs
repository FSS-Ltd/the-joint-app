import process from "node:process";
import { readFileSync } from "node:fs";
import { parseEnv } from "node:util";
import { URL } from "node:url";

// Next's development server forwards execArgv through NODE_OPTIONS. --import is
// supported there; Node's --env-file flags are not. Keep builds key-free.
const settings = {};
for (const path of ["../.env", "../.env.clerk"]) {
  try {
    Object.assign(
      settings,
      parseEnv(readFileSync(new URL(path, import.meta.url), "utf8")),
    );
  } catch (error) {
    if (error?.code !== "ENOENT")
      throw new Error(
        "Local web configuration unavailable. Check .env and .env.clerk.",
        { cause: error },
      );
  }
}
// Later files override earlier files, while explicitly supplied process settings win.
for (const [key, value] of Object.entries(settings))
  if (process.env[key] === undefined) process.env[key] = value;
