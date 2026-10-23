import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { expect, it } from "vitest";

it("replays newer Clerk deletion intent into an older backup before opening access", async () => {
  const result = await promisify(execFile)(
    process.execPath,
    ["tests/fixtures/clerk-restore.mjs"],
    { timeout: 60_000, maxBuffer: 65536 },
  );
  expect(result.stdout).toContain("Clerk restore proof passed");
}, 65_000);
