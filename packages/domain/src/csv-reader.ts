import { Readable } from "node:stream";
import { parse } from "csv-parse";
import { MAX_CSV_BYTES, MAX_CSV_ROWS, type CsvColumn } from "@joint/contracts";

export class CsvInputError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}
interface CsvRecord {
  cells: string[];
  raw: string;
}
function stringArray(value: unknown): value is string[] {
  return (
    Array.isArray(value) &&
    value.every((cell: unknown) => typeof cell === "string")
  );
}
function record(value: unknown): CsvRecord {
  if (
    typeof value !== "object" ||
    value === null ||
    !("record" in value) ||
    !("raw" in value) ||
    !stringArray(value.record) ||
    typeof value.raw !== "string"
  )
    throw new CsvInputError("CSV_INVALID_FORMAT");
  if (Buffer.byteLength(value.raw, "utf8") > 65536)
    throw new CsvInputError("CSV_RECORD_TOO_LARGE");
  if (value.record.length > 100)
    throw new CsvInputError("CSV_TOO_MANY_COLUMNS");
  return { cells: value.record, raw: value.raw };
}
export async function* readCsv(bytes: Uint8Array): AsyncGenerator<string[]> {
  if (bytes.byteLength > MAX_CSV_BYTES)
    throw new CsvInputError("CSV_TOO_LARGE");
  if (!bytes.byteLength) throw new CsvInputError("CSV_EMPTY");
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new CsvInputError("CSV_INVALID_ENCODING");
  }
  const source = Readable.from(
    (function* () {
      for (let offset = 0; offset < bytes.byteLength; offset += 65536)
        yield Buffer.from(bytes.subarray(offset, offset + 65536));
    })(),
  );
  const parser = parse({
    bom: true,
    raw: true,
    columns: false,
    relax_column_count: true,
    skip_empty_lines: false,
    max_record_size: 65536,
  });
  source.pipe(parser);
  let count = 0;
  try {
    for await (const item of parser) {
      const value: unknown = item;
      const parsed = record(value);
      if (count++ > MAX_CSV_ROWS) throw new CsvInputError("CSV_TOO_MANY_ROWS");
      yield parsed.cells;
    }
  } catch (error) {
    if (error instanceof CsvInputError) throw error;
    throw new CsvInputError("CSV_INVALID_FORMAT");
  } finally {
    source.destroy();
    parser.destroy();
  }
}
export function csvColumns(header: string[]): CsvColumn[] {
  if (!header.length || header.every((cell) => !cell.trim()))
    throw new CsvInputError("CSV_INVALID_HEADERS");
  if (header.some((cell) => cell.trim().length > 128))
    throw new CsvInputError("CSV_INVALID_HEADERS");
  return header.map((label, index) => ({
    index,
    label: label.trim() || `Column ${index + 1}`,
  }));
}
