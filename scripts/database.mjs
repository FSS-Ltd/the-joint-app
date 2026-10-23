import process from "node:process";
import { spawnSync } from "node:child_process";
import {
  databaseEnvironmentSchema,
  migrationEnvironmentSchema,
  readEnvironment,
} from "../packages/contracts/dist/index.js";
const action = process.argv[2];
try {
  if (action !== "migrate" && action !== "seed")
    throw new Error("Use database.mjs migrate or seed");
  readEnvironment(databaseEnvironmentSchema, process.env);
  readEnvironment(migrationEnvironmentSchema, process.env);
  const result = spawnSync(
    "pnpm",
    ["--filter", "@joint/database", `db:${action}`],
    { stdio: "inherit" },
  );
  process.exitCode = result.status ?? 1;
} catch (error) {
  process.stderr.write(
    error instanceof Error &&
      error.message.startsWith("Invalid environment fields:")
      ? `${error.message}\n`
      : "Database command unavailable; check setup and command\n",
  );
  process.exitCode = 1;
}
