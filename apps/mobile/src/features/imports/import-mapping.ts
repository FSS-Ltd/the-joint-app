import {
  csvMappingSchema,
  type CsvColumn,
  type CsvMapping,
  type CsvMappingSuggestion,
} from "@joint/contracts";
import type { InputResult } from "../accounts/write-input";

/** Column fields hold an index as text; "" means unset. Conventions have no default. */
export type MappingDraft = {
  amountMode: "" | "SIGNED" | "DEBIT_CREDIT";
  date: string;
  description: string;
  amount: string;
  debit: string;
  credit: string;
  currency: string;
  sourceId: string;
  dateFormat: "" | "ISO" | "DMY" | "MDY";
  decimalSeparator: "" | "DOT" | "COMMA";
  positiveIs: "" | "INFLOW" | "OUTFLOW";
};
export const emptyMapping: MappingDraft = {
  amountMode: "",
  date: "",
  description: "",
  amount: "",
  debit: "",
  credit: "",
  currency: "",
  sourceId: "",
  dateFormat: "",
  decimalSeparator: "",
  positiveIs: "",
};
/** Preserve only conventions the server could identify; no amount direction is inferred here. */
export function suggestedDraft(suggestion: CsvMappingSuggestion): MappingDraft {
  const column = (value: number | null | undefined) =>
    value == null ? "" : String(value);
  return {
    amountMode: suggestion.amountMode ?? "",
    date: column(suggestion.date),
    description: column(suggestion.description),
    amount: column(suggestion.amount),
    debit: column(suggestion.debit),
    credit: column(suggestion.credit),
    currency: column(suggestion.currency),
    sourceId: column(suggestion.sourceId),
    dateFormat: suggestion.dateFormat ?? "",
    decimalSeparator: suggestion.decimalSeparator ?? "",
    positiveIs: suggestion.positiveIs ?? "",
  };
}
export function missingRequired(
  draft: MappingDraft,
  requiresCurrencyColumn = false,
): boolean {
  return (
    (requiresCurrencyColumn && !draft.currency) ||
    !draft.date ||
    !draft.description ||
    !draft.amountMode ||
    !draft.dateFormat ||
    !draft.decimalSeparator ||
    (draft.amountMode === "SIGNED" && (!draft.amount || !draft.positiveIs)) ||
    (draft.amountMode === "DEBIT_CREDIT" && (!draft.debit || !draft.credit))
  );
}
const invalid =
  "Choose a different column for each field, and select the date format, decimal separator and amount layout.";
/** Only the file's own columns are choices; "" clears an optional field. */
export function columnChoices(
  columns: readonly CsvColumn[],
  unsetLabel = "Not used",
): {
  options: string[];
  labels: Record<string, string>;
} {
  const labels: Record<string, string> = { "": unsetLabel };
  for (const column of columns)
    labels[String(column.index)] =
      `Column ${column.index + 1}: ${column.label}`;
  // Object keys sort integer-like names first, so the unset option is placed explicitly.
  return { options: ["", ...columns.map((c) => String(c.index))], labels };
}
export function mappingInput(
  draft: MappingDraft,
  columnCount: number,
): InputResult<CsvMapping> {
  const index = (value: string): number | null | undefined => {
    if (value === "") return null;
    if (!/^\d{1,2}$/.test(value)) return undefined;
    const parsed = Number(value);
    return parsed < columnCount ? parsed : undefined;
  };
  const fields = {
    date: index(draft.date),
    description: index(draft.description),
    amount: draft.amountMode === "SIGNED" ? index(draft.amount) : null,
    debit: draft.amountMode === "DEBIT_CREDIT" ? index(draft.debit) : null,
    credit: draft.amountMode === "DEBIT_CREDIT" ? index(draft.credit) : null,
    currency: index(draft.currency),
    sourceId: index(draft.sourceId),
  };
  if (Object.values(fields).some((value) => value === undefined))
    return { ok: false, message: invalid };
  const parsed = csvMappingSchema.safeParse({
    ...fields,
    dateFormat: draft.dateFormat,
    decimalSeparator: draft.decimalSeparator,
    amountMode: draft.amountMode,
    positiveIs: draft.amountMode === "SIGNED" ? draft.positiveIs : "INFLOW",
  });
  return parsed.success
    ? { ok: true, value: parsed.data }
    : { ok: false, message: invalid };
}
