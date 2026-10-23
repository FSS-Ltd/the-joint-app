import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { delimiter, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { afterEach, expect, it } from "vitest";

const execute = promisify(execFile),
  directories: string[] = [];
afterEach(async () => {
  for (const directory of directories.splice(0))
    await rm(directory, { recursive: true });
});
async function fixture(scenario: string) {
  const directory = await mkdtemp(join(tmpdir(), "joint-restore-transport-"));
  directories.push(directory);
  const id = randomUUID(),
    name = `joint-restore-${id}`,
    volume = `${name}-data`,
    log = join(directory, "actions");
  await writeFile(
    join(directory, "docker"),
    `#!/usr/bin/env node
const fs=require('node:fs');
const args=process.argv.slice(2),mode=process.env.DOCKER_TEST_SCENARIO;
if(mode==='ERROR') process.exit(1);
if(mode==='SOURCE') {
 if(args[0]==='ps') process.stdout.write('sourceCandidate\\nunrelatedCandidate');
 else process.stdout.write(JSON.stringify(args.at(-1)==='sourceCandidate'?[{HostIp:'127.0.0.1',HostPort:'15432'}]:[{HostIp:'127.0.0.1',HostPort:'15433'}]));
 process.exit(0);
}
if(mode==='ABSENT') process.exit(0);
if(args[0]==='ps') process.stdout.write(process.env.DOCKER_TEST_NAME);
else if(args[0]==='inspect') process.stdout.write(mode==='MISMATCH'?'foreign':process.env.DOCKER_TEST_ID);
else if(args[0]==='rm') fs.appendFileSync(process.env.DOCKER_TEST_LOG,'container\\n');
else if(args[0]==='volume'&&args[1]==='ls') process.stdout.write(process.env.DOCKER_TEST_VOLUME);
else if(args[0]==='volume'&&args[1]==='inspect') process.stdout.write(process.env.DOCKER_TEST_ID);
else if(args[0]==='volume'&&args[1]==='rm') fs.appendFileSync(process.env.DOCKER_TEST_LOG,'volume\\n');
`,
    { mode: 0o700 },
  );
  const module = pathToFileURL(resolve("scripts/restore/containers.mjs")).href;
  const env = {
    ...process.env,
    PATH: `${directory}${delimiter}${process.env.PATH}`,
    DOCKER_TEST_SCENARIO: scenario,
    DOCKER_TEST_NAME: name,
    DOCKER_TEST_VOLUME: volume,
    DOCKER_TEST_ID: id,
    DOCKER_TEST_LOG: log,
  };
  return { log, env, module, id, name, volume };
}
it("requires successful inventories before claiming cleanup or removing owned resources", async () => {
  const absent = await fixture("ABSENT");
  const run = (value: Awaited<ReturnType<typeof fixture>>) =>
    execute(
      process.execPath,
      [
        "--input-type=module",
        "-e",
        `import {destroyTarget} from ${JSON.stringify(value.module)};await destroyTarget(${JSON.stringify({ id: value.id, name: value.name, volume: value.volume })});`,
      ],
      { env: value.env },
    );
  await expect(run(absent)).resolves.toBeDefined();
  const unavailable = await fixture("ERROR");
  await expect(run(unavailable)).rejects.toThrow();
  const mismatch = await fixture("MISMATCH");
  await expect(run(mismatch)).rejects.toThrow();
  await expect(readFile(mismatch.log, "utf8")).rejects.toThrow();
  const owned = await fixture("OWNED");
  await run(owned);
  expect(await readFile(owned.log, "utf8")).toBe("container\nvolume\n");
});
it("selects the actual loopback host port before applying source uniqueness", async () => {
  const value = await fixture("SOURCE");
  const { stdout } = await execute(
    process.execPath,
    [
      "--input-type=module",
      "-e",
      `import {sourceContainer,localDatabase} from ${JSON.stringify(value.module)};const source=await sourceContainer(localDatabase('postgresql://joint:synthetic@127.0.0.1:15432/joint'));process.stdout.write(source.name);`,
    ],
    { env: value.env },
  );
  expect(stdout).toBe("sourceCandidate");
});
