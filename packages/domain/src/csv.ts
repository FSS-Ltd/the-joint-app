import { createHash } from "node:crypto";
import {
  csvMappingSchema,
  isSupportedFinancialText,
  type CsvColumn,
  type CsvMapping,
  type CsvRejectCode,
  type NormalizedCsvRow,
} from "@joint/contracts";
import { CsvInputError, csvColumns, readCsv } from "./csv-reader.js";
import {
  checkedMoney,
  londonToday,
  parseBookedDate,
  parseCsvAmount,
} from "./transaction-normalisation.js";
export { CsvInputError } from "./csv-reader.js";

export async function inspectCsv(
  bytes: Uint8Array,
): Promise<{ columns: CsvColumn[]; rowCount: number }> {
  let columns: CsvColumn[] | undefined;
  let rowCount = 0;
  for await (const cells of readCsv(bytes)) {
    if (!columns) columns = csvColumns(cells);
    else rowCount++;
  }
  if (!columns || !rowCount) throw new CsvInputError("CSV_EMPTY");
  return { columns, rowCount };
}
export function transactionSourceHash(value: {
  bookedDate: string;
  money: { amountMinor: string; currency: string };
  description: string;
}): string {
  return createHash("sha256")
    .update(
      JSON.stringify([
        value.bookedDate,
        value.money.amountMinor,
        value.money.currency,
        value.description,
      ]),
    )
    .digest("hex");
}
export function transactionFingerprint(value: {
  bookedDate: string;
  money: { amountMinor: string; currency: string };
  description: string;
}): string {
  return transactionSourceHash({
    ...value,
    description: value.description
      .toLocaleLowerCase("en-GB")
      .replace(/\s+/g, " ")
      .trim(),
  });
}
function normalizeRow(
  cells: string[],
  count: number,
  rowNumber: number,
  mapping: CsvMapping,
  today: string,
): NormalizedCsvRow {
  const reject = (reason: CsvRejectCode): NormalizedCsvRow => ({
    rowNumber,
    status: "REJECTED",
    reason,
  });
  if (cells.length !== count) return reject("COLUMN_COUNT");
  const bookedDate = parseBookedDate(
    cells[mapping.date] ?? "",
    mapping.dateFormat,
  );
  if (!bookedDate) return reject("INVALID_DATE");
  if (bookedDate > today) return reject("FUTURE_DATE");
  const description = (cells[mapping.description] ?? "").trim();
  if (
    !description ||
    description.length > 500 ||
    !isSupportedFinancialText(description)
  )
    return reject("INVALID_DESCRIPTION");
  if (
    mapping.currency !== null &&
    (cells[mapping.currency] ?? "").trim().toUpperCase() !== "GBP"
  )
    return reject("UNSUPPORTED_CURRENCY");
  let amount: bigint;
  if (mapping.amountMode === "SIGNED") {
    const parsed = parseCsvAmount(
      cells[mapping.amount ?? -1] ?? "",
      mapping.decimalSeparator,
    );
    if (parsed === null) return reject("INVALID_AMOUNT");
    amount = mapping.positiveIs === "OUTFLOW" ? -parsed : parsed;
  } else {
    const debit = parseCsvAmount(
      (cells[mapping.debit ?? -1] ?? "").trim() || "0",
      mapping.decimalSeparator,
    );
    const credit = parseCsvAmount(
      (cells[mapping.credit ?? -1] ?? "").trim() || "0",
      mapping.decimalSeparator,
    );
    if (debit === null || credit === null || debit < 0n || credit < 0n)
      return reject("INVALID_AMOUNT");
    if (debit !== 0n && credit !== 0n) return reject("AMBIGUOUS_AMOUNT");
    amount = credit - debit;
  }
  const money = checkedMoney(amount);
  if (!money) return reject("INVALID_AMOUNT");
  const sourceId =
    mapping.sourceId === null ? null : (cells[mapping.sourceId] ?? "").trim();
  if (
    sourceId !== null &&
    (!sourceId || sourceId.length > 160 || !isSupportedFinancialText(sourceId))
  )
    return reject("INVALID_SOURCE_ID");
  const value = { bookedDate, money, description };
  return {
    rowNumber,
    status: "VALID",
    ...value,
    sourceId,
    sourceHash: transactionSourceHash(value),
    fingerprint: transactionFingerprint(value),
    decision: "KEEP",
    duplicate: false,
    overlaps: [],
  };
}
export async function normalizeCsv(
  bytes: Uint8Array,
  input: CsvMapping,
  today = londonToday(),
): Promise<{ columns: CsvColumn[]; rows: NormalizedCsvRow[] }> {
  const parsed = csvMappingSchema.safeParse(input);
  if (!parsed.success) throw new CsvInputError("CSV_INVALID_MAPPING");
  const mapping = parsed.data;
  let columns: CsvColumn[] | undefined;
  const rows: NormalizedCsvRow[] = [];
  for await (const cells of readCsv(bytes)) {
    if (!columns) {
      columns = csvColumns(cells);
      const indexes = [
        mapping.date,
        mapping.description,
        mapping.amount,
        mapping.debit,
        mapping.credit,
        mapping.currency,
        mapping.sourceId,
      ];
      if (indexes.some((index) => index !== null && index >= cells.length))
        throw new CsvInputError("CSV_INVALID_MAPPING");
    } else
      rows.push(
        normalizeRow(cells, columns.length, rows.length + 1, mapping, today),
      );
  }
  if (!columns || !rows.length) throw new CsvInputError("CSV_EMPTY");
  return { columns, rows };
}
