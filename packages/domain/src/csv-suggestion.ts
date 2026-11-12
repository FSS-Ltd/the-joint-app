import type {
  CsvColumn,
  CsvMapping,
  CsvMappingSuggestion,
} from "@joint/contracts";
import { isSupportedFinancialText } from "@joint/contracts";
import {
  parseBookedDate,
  parseCsvAmount,
} from "./transaction-normalisation.js";

const aliases = {
  date: ["date", "transaction date", "booking date", "booked date"],
  description: ["description", "transaction description", "details"],
  amount: ["amount", "transaction amount"],
  debit: ["debit", "paid out", "money out"],
  credit: ["credit", "paid in", "money in"],
  currency: ["currency", "currency code"],
  sourceId: ["transaction id", "transaction identifier"],
} as const;
type Field = keyof typeof aliases;

function normalized(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export class CsvSuggestion {
  private readonly mapping: CsvMappingSuggestion = {};
  private readonly dateFormats = new Set<CsvMapping["dateFormat"]>([
    "ISO",
    "DMY",
    "MDY",
  ]);
  private readonly separators = new Set<CsvMapping["decimalSeparator"]>([
    "DOT",
    "COMMA",
  ]);
  private readonly sourceIds = new Set<string>();
  private dateSeen = false;
  private amountSeen = false;
  private sourceIdsValid = true;
  private readonly amountIndexes: number[];
  private readonly width: number;
  readonly requiresCurrencyColumn: boolean;

  constructor(columns: CsvColumn[]) {
    this.width = columns.length;
    const matches = (field: Field) =>
      columns
        .filter((column) =>
          (aliases[field] as readonly string[]).includes(
            normalized(column.label),
          ),
        )
        .map((column) => column.index);
    const unique = (field: Field) => {
      const indexes = matches(field);
      return indexes.length === 1 ? indexes[0] : undefined;
    };
    this.mapping.date = unique("date");
    this.mapping.description = unique("description");
    const currency = matches("currency");
    this.mapping.currency = currency.length === 1 ? currency[0] : undefined;
    this.requiresCurrencyColumn = currency.length > 1;
    this.mapping.sourceId = unique("sourceId");
    const amount = matches("amount"),
      debit = matches("debit"),
      credit = matches("credit");
    this.amountIndexes = [];
    if (amount.length === 1 && !debit.length && !credit.length) {
      this.mapping.amount = amount[0];
      this.mapping.amountMode = "SIGNED";
      this.amountIndexes.push(amount[0]!);
    } else if (!amount.length && debit.length === 1 && credit.length === 1) {
      this.mapping.debit = debit[0];
      this.mapping.credit = credit[0];
      this.mapping.amountMode = "DEBIT_CREDIT";
      this.amountIndexes.push(debit[0]!, credit[0]!);
    }
  }

  observe(cells: string[]): void {
    if (cells.length !== this.width) return;
    if (this.mapping.date !== undefined) {
      const value = cells[this.mapping.date]?.trim() ?? "";
      if (value) {
        const accepted = (["ISO", "DMY", "MDY"] as const).filter((format) =>
          parseBookedDate(value, format),
        );
        if (accepted.length) {
          this.dateSeen = true;
          for (const format of this.dateFormats)
            if (!accepted.includes(format)) this.dateFormats.delete(format);
        }
      }
    }
    for (const index of this.amountIndexes) {
      const value = cells[index]?.trim() ?? "";
      if (!value) continue;
      const dot = parseCsvAmount(value, "DOT");
      const comma = parseCsvAmount(value, "COMMA");
      if (dot === null && comma === null) continue;
      this.amountSeen = true;
      if (dot === null) this.separators.delete("DOT");
      if (comma === null) this.separators.delete("COMMA");
      if (this.separators.size === 2 && dot !== comma) this.separators.clear();
    }
    if (this.mapping.sourceId != null) {
      const value = cells[this.mapping.sourceId]?.trim() ?? "";
      if (
        !value ||
        value.length > 160 ||
        !isSupportedFinancialText(value) ||
        this.sourceIds.has(value)
      )
        this.sourceIdsValid = false;
      else this.sourceIds.add(value);
    }
  }

  result(): CsvMappingSuggestion {
    if (this.dateSeen && this.dateFormats.size === 1)
      this.mapping.dateFormat = [...this.dateFormats][0];
    if (this.amountSeen && this.separators.size === 1)
      this.mapping.decimalSeparator = [...this.separators][0];
    else if (this.amountSeen && this.separators.size === 2)
      this.mapping.decimalSeparator = "DOT";
    if (!this.sourceIdsValid || !this.sourceIds.size)
      delete this.mapping.sourceId;
    return Object.fromEntries(
      Object.entries(this.mapping).filter(([, value]) => value !== undefined),
    );
  }
}
