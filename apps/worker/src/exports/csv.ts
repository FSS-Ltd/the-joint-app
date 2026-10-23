export interface ExportCsvRow {
  recordType: string;
  accountId: string;
  recordId: string;
  date?: string;
  amountMinor?: string;
  currency?: string;
  label?: string;
  description?: string;
  category?: string;
  classification?: string;
  note?: string;
  details?: string;
}

export const exportCsvHeader =
  "record_type,account_id,record_id,date,amount_minor,currency,label,description,category,classification,note,details\r\n";

export function spreadsheetText(value: string): string {
  // Spreadsheet readers may discard invisible prefixes before evaluating a cell.
  return /^[\s\p{Cc}\p{Cf}]*[=+\-@]/u.test(value) ? `'${value}` : value;
}

export function encodeExportRow(row: ExportCsvRow): string {
  if (
    row.amountMinor !== undefined &&
    !/^(?:0|[1-9]\d*|-[1-9]\d*)$/.test(row.amountMinor)
  )
    throw new Error("Invalid export amount");
  const text = (value: string | undefined): string =>
    quote(spreadsheetText(value ?? ""));
  return (
    [
      text(row.recordType),
      text(row.accountId),
      text(row.recordId),
      text(row.date),
      quote(row.amountMinor ?? ""),
      text(row.currency),
      text(row.label),
      text(row.description),
      text(row.category),
      text(row.classification),
      text(row.note),
      text(row.details),
    ].join(",") + "\r\n"
  );
}

function quote(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}
