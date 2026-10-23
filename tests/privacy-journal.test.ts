import { randomUUID } from "node:crypto";
import {
  chmod,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import {
  PrivacyJournal,
  type PrivacyJournalEntry,
} from "../packages/database/src/privacy-journal.js";

const directories: string[] = [];
afterEach(async () => {
  await Promise.all(
    directories.splice(0).map((path) => rm(path, { recursive: true })),
  );
});
async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), "joint-privacy-journal-"));
  directories.push(directory);
  await chmod(directory, 0o700);
  const path = join(directory, "ledger.ndjson");
  return { directory, path, journal: new PrivacyJournal(path) };
}
function entry(): PrivacyJournalEntry {
  return {
    version: 1,
    eventId: randomUUID(),
    requestId: randomUUID(),
    userId: randomUUID(),
    kind: "DELETE_USER",
    recordedAt: new Date().toISOString(),
  };
}

it("durably appends minimal verified intents and replays all entries in order", async () => {
  const { journal, path } = await fixture();
  const first = entry();
  const second: PrivacyJournalEntry = {
    ...entry(),
    kind: "LEAVE_HOUSEHOLD",
    householdId: randomUUID(),
  };
  await journal.append(first);
  await journal.append(second);
  const entries = [];
  for await (const value of journal.entries()) entries.push(value);
  expect(entries).toEqual([first, second]);
  expect((await readFile(path, "utf8")).endsWith("\n")).toBe(true);
});

it("fails closed on a missing or truncated journal and exposes no raw content", async () => {
  const { journal, path } = await fixture();
  const replay = async () => {
    for await (const value of journal.entries()) void value;
  };
  await expect(replay()).rejects.toThrow("Privacy journal unavailable");
  await writeFile(path, '{"secret":"SYNTHETIC_SENTINEL"}', { mode: 0o600 });
  await expect(replay()).rejects.toThrow("Privacy journal unavailable");
});

it("rejects extra payload, missing household and unsafe file permissions", async () => {
  const { journal, path } = await fixture();
  await expect(
    journal.append({ ...entry(), secret: "SENTINEL" }),
  ).rejects.toThrow("Privacy journal unavailable");
  await expect(
    journal.append({ ...entry(), kind: "LEAVE_HOUSEHOLD" }),
  ).rejects.toThrow("Privacy journal unavailable");
  await journal.append(entry());
  await chmod(path, 0o644);
  await expect(journal.append(entry())).rejects.toThrow(
    "Privacy journal unavailable",
  );
});

it("does not follow a journal symlink or append through a concurrent writer lock", async () => {
  const { directory, journal, path } = await fixture();
  const target = join(directory, "target");
  await writeFile(target, "", { mode: 0o600 });
  await symlink(target, path);
  await expect(journal.append(entry())).rejects.toThrow(
    "Privacy journal unavailable",
  );
  expect(await readFile(target, "utf8")).toBe("");
  await rm(path);
  await writeFile(`${path}.lock`, "", { mode: 0o600 });
  await expect(journal.append(entry())).rejects.toThrow(
    "Privacy journal unavailable",
  );
});

it("closes a partially consumed replay and refuses to append onto a truncated journal", async () => {
  const { journal, path } = await fixture();
  await journal.append(entry());
  await journal.append(entry());
  for await (const value of journal.entries()) {
    expect(value.kind).toBe("DELETE_USER");
    break;
  }
  await journal.append(entry());
  let count = 0;
  for await (const value of journal.entries()) {
    expect(value.version).toBe(1);
    count++;
  }
  expect(count).toBe(3);
  const truncated = JSON.stringify(entry());
  await writeFile(path, truncated);
  await expect(journal.append(entry())).rejects.toThrow(
    "Privacy journal unavailable",
  );
  expect(await readFile(path, "utf8")).toBe(truncated);
});

it("retains only bounded external Clerk identifiers for deletion replay", async () => {
  const { journal } = await fixture();
  const identity = {
    provider: "clerk",
    issuer: "https://synthetic.clerk.accounts.dev",
    subject: "user_synthetic",
  };
  const intent = { ...entry(), providerIdentities: [identity] };
  await journal.append(intent);
  const entries = [];
  for await (const value of journal.entries()) entries.push(value);
  expect(entries).toEqual([intent]);
  for (const providerIdentities of [
    [{ ...identity, email: "private@example.test" }],
    [{ ...identity, issuer: "https://example.test/path?secret=SENTINEL" }],
    [{ ...identity, subject: "internal-uuid" }],
    [identity, identity],
    Array.from({ length: 6 }, (_, i) => ({
      ...identity,
      subject: `user_${i}`,
    })),
  ])
    await expect(
      journal.append({ ...entry(), providerIdentities }),
    ).rejects.toThrow("Privacy journal unavailable");
});
