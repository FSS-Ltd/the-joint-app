import { constants } from "node:fs";
import { lstat, open, unlink, type FileHandle } from "node:fs/promises";
import { dirname, isAbsolute } from "node:path";
import { createInterface } from "node:readline";
import {
  parseJournalEntry,
  type PrivacyJournalEntry,
} from "./privacy-journal-entry.js";
export type { PrivacyJournalEntry } from "./privacy-journal-entry.js";

/** Local-only journal, stored outside every database backup. Failure closes access. */
export class PrivacyJournal {
  constructor(private readonly path: string) {
    if (!isAbsolute(path)) throw new Error("Privacy journal unavailable");
  }

  async append(input: unknown): Promise<void> {
    try {
      const entry = parseJournalEntry(input);
      await this.requirePrivateDirectory();
      const lock = await open(
        `${this.path}.lock`,
        constants.O_WRONLY |
          constants.O_CREAT |
          constants.O_EXCL |
          constants.O_NOFOLLOW,
        0o600,
      );
      try {
        const file = await open(
          this.path,
          constants.O_RDWR |
            constants.O_APPEND |
            constants.O_CREAT |
            constants.O_NOFOLLOW,
          0o600,
        );
        try {
          await requirePrivateFile(file);
          await requireCompleteLine(file);
          await file.appendFile(`${JSON.stringify(entry)}\n`, "utf8");
          await file.sync();
        } finally {
          await file.close();
        }
        const directory = await open(dirname(this.path), constants.O_RDONLY);
        try {
          await directory.sync();
        } finally {
          await directory.close();
        }
      } finally {
        await lock.close();
        await unlink(`${this.path}.lock`);
      }
    } catch {
      throw new Error("Privacy journal unavailable");
    }
  }

  async *entries(): AsyncGenerator<PrivacyJournalEntry> {
    try {
      await this.requirePrivateDirectory();
      const file = await open(
        this.path,
        constants.O_RDONLY | constants.O_NOFOLLOW,
      );
      try {
        await requirePrivateFile(file);
        const size = await requireCompleteLine(file);
        if (size === 0) return;
        // Capture a complete snapshot. Restore must run with application access closed.
        const input = file.createReadStream({
          start: 0,
          end: size - 1,
          autoClose: false,
        });
        const lines = createInterface({
          input,
          crlfDelay: Infinity,
        });
        try {
          for await (const line of lines) {
            if (Buffer.byteLength(line, "utf8") > 4096) throw new Error();
            const entry: unknown = JSON.parse(line);
            yield parseJournalEntry(entry);
          }
        } finally {
          lines.close();
          input.destroy();
        }
      } finally {
        await file.close();
      }
    } catch {
      throw new Error("Privacy journal unavailable");
    }
  }

  private async requirePrivateDirectory(): Promise<void> {
    const directory = await lstat(dirname(this.path));
    if (
      !directory.isDirectory() ||
      (directory.mode & 0o077) !== 0 ||
      directory.uid !== process.getuid?.()
    )
      throw new Error();
  }
}

async function requirePrivateFile(file: FileHandle): Promise<void> {
  const stat = await file.stat();
  if (
    !stat.isFile() ||
    (stat.mode & 0o077) !== 0 ||
    stat.uid !== process.getuid?.()
  )
    throw new Error();
}

async function requireCompleteLine(file: FileHandle): Promise<number> {
  const { size } = await file.stat();
  if (size > 0) {
    const last = Buffer.alloc(1);
    const { bytesRead } = await file.read(last, 0, 1, size - 1);
    if (bytesRead !== 1 || last[0] !== 10) throw new Error();
  }
  return size;
}
