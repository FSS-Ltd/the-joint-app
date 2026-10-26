import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { expect, it } from "vitest";

const execute = promisify(execFile);
it("restores an isolated snapshot, replays later privacy intents before login, and proves restricted isolation", async () => {
  const { stdout } = await execute(
    process.execPath,
    ["scripts/local-restore-rehearsal.mjs"],
    { env: process.env, timeout: 180000, maxBuffer: 1024 * 1024 },
  );
  expect(JSON.parse(stdout)).toMatchObject({
    result: "PASS",
    runtimeClosedBeforeReplay: true,
    canonicalPurge: true,
    ciphertextRecovered: true,
    absentUserTombstoned: true,
    wholeBudgetScopeRemoved: true,
    fundingExclusivePurged: true,
    fundingFrozenArchive: true,
    fundingJointRetained: true,
    allocationExclusivePurged: true,
    allocationFrozenArchive: true,
    allocationJointRetained: true,
    contributionExclusivePurged: true,
    contributionFrozenArchive: true,
    contributionSharedRetained: true,
    goalPrivacyPurged: true,
    goalFrozenArchive: true,
    goalSharedRetained: true,
    jointHistoryRetained: true,
    archiveScopeIsolated: true,
    neighborUnchanged: true,
    idempotentReplay: true,
    providerMode: "ISOLATED_SYNTHETIC_MIRROR",
    developmentUnchanged: true,
    cleanup: true,
  });
  expect(stdout).not.toContain("RESTORE_SECRET_SENTINEL");
}, 180000);
