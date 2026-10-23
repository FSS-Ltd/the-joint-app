import { spawnSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";

it.each([false, true])(
  "web environment preload works through NODE_OPTIONS and preserves explicit overrides (override=%s)",
  async (override) => {
    const directory = await mkdtemp(join(tmpdir(), "joint-web-environment-"));
    try {
      await mkdir(join(directory, "scripts"));
      const loader = join(directory, "scripts/web-env.mjs");
      await writeFile(
        loader,
        await readFile(new URL("../scripts/web-env.mjs", import.meta.url)),
      );
      await writeFile(
        join(directory, ".env"),
        "AUTH_PROVIDER=local\nSYNTHETIC_WEB_SHARED=root\nSYNTHETIC_WEB_ROOT=present\n",
      );
      await writeFile(
        join(directory, ".env.clerk"),
        'AUTH_PROVIDER=clerk\nSYNTHETIC_WEB_SHARED=clerk\nSYNTHETIC_WEB_MULTILINE="first\\nsecond"\n',
      );
      const result = spawnSync(
        process.execPath,
        [
          "-e",
          "process.stdout.write(JSON.stringify({provider:process.env.AUTH_PROVIDER,shared:process.env.SYNTHETIC_WEB_SHARED,root:process.env.SYNTHETIC_WEB_ROOT,multiline:process.env.SYNTHETIC_WEB_MULTILINE}))",
        ],
        {
          cwd: directory,
          encoding: "utf8",
          env: {
            ...process.env,
            NODE_OPTIONS: `--import=${loader}`,
            ...(override
              ? { AUTH_PROVIDER: "local" }
              : { AUTH_PROVIDER: undefined }),
          },
        },
      );
      expect(result.status, result.stderr).toBe(0);
      expect(JSON.parse(result.stdout)).toEqual({
        provider: override ? "local" : "clerk",
        shared: "clerk",
        root: "present",
        multiline: "first\nsecond",
      });
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  },
);
