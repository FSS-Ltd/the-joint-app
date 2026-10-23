import { spawn } from "node:child_process";
import process from "node:process";

const command = process.argv[2];
if (command !== "up" && command !== "down")
  throw new Error("Use auth:up or auth:down");
if (command === "up") await import("./auth-setup.mjs");
process.loadEnvFile(".env.auth");
const args = [
  "compose",
  "--profile",
  "auth",
  ...(command === "up"
    ? ["up", "-d", "--wait"]
    : ["stop", "auth-gateway", "auth", "mailpit", "auth-db"]),
];
const child = spawn("docker", args, { stdio: "inherit", env: process.env });
child.once("error", () => {
  process.stderr.write(
    "Local Auth could not start. Ensure Docker is running.\n",
  );
  process.exitCode = 1;
});
child.once("exit", (code) => {
  process.exitCode = code ?? 1;
});
