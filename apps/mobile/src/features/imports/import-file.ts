import { MAX_CSV_BYTES } from "@joint/contracts";
import type { InputResult } from "../accounts/write-input";

export interface PickedFile {
  name: string;
  uri: string;
  size?: number | undefined;
}
export type CsvReader = (
  uri: string,
  signal: AbortSignal,
) => Promise<ArrayBuffer>;

/** Only the picker's own local cache copy is ever read; never a network or provider URI. */
function localUri(uri: string): boolean {
  if (!/^file:\/\/\//i.test(uri)) return false;
  let decoded: string;
  try {
    decoded = decodeURIComponent(uri);
  } catch {
    return false;
  }
  return !/(^|[\\/])\.\.([\\/]|$)/.test(decoded);
}
/** Metadata checks run before a single byte is read. */
export function pickedFileProblem(file: PickedFile): string | null {
  if (!/[^/\\]\.csv$/i.test(file.name))
    return "Choose a file with the .csv extension.";
  if (!localUri(file.uri)) return "That file could not be opened from here.";
  if (file.size !== undefined && (file.size <= 0 || file.size > MAX_CSV_BYTES))
    return file.size <= 0
      ? "That file is empty."
      : "Choose a CSV file of 10 MiB or less.";
  return null;
}
const unreadable = "We could not read that file. Choose it again.";
/** Reads the whole file once; the real size is re-checked because metadata can lie. */
export async function readCsvBytes(
  file: PickedFile,
  signal: AbortSignal,
  reader: CsvReader,
): Promise<InputResult<Uint8Array<ArrayBuffer>>> {
  const problem = pickedFileProblem(file);
  if (problem) return { ok: false, message: problem };
  let buffer: ArrayBuffer;
  try {
    buffer = await reader(file.uri, signal);
  } catch {
    // The failure text can carry a local path; show fixed copy instead.
    return { ok: false, message: unreadable };
  }
  if (signal.aborted) return { ok: false, message: unreadable };
  if (buffer.byteLength === 0)
    return { ok: false, message: "That file is empty." };
  if (buffer.byteLength > MAX_CSV_BYTES)
    return { ok: false, message: "Choose a CSV file of 10 MiB or less." };
  return { ok: true, value: new Uint8Array(buffer) };
}
