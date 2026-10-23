import { setTimeout, clearTimeout } from "node:timers";
import { spawn } from "node:child_process";
import process from "node:process";

/** Child output may contain restored records or credentials: never surface it. */
export function docker(
  args,
  { env = {}, input, output, timeout = 120000 } = {},
) {
  return new Promise((resolve, reject) => {
    const child = spawn("docker", args, {
      env: { ...process.env, ...env },
      stdio: [input ?? "ignore", output ?? "pipe", "pipe"],
    });
    let text = "";
    const timer = setTimeout(() => child.kill("SIGKILL"), timeout);
    child.stdout?.on("data", (bytes) => {
      if (text.length + bytes.length > 1048576) child.kill("SIGKILL");
      else text += bytes.toString();
    });
    child.stderr?.resume();
    child.once("error", () => {
      clearTimeout(timer);
      reject(new Error("Restore container command unavailable"));
    });
    child.once("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve(text.trim());
      else reject(new Error("Restore container command unavailable"));
    });
  });
}
