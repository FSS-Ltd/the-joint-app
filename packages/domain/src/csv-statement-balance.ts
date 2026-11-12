import type {
  CsvColumn,
  CsvMapping,
  CsvMappingSuggestion,
} from "@joint/contracts";
import { isSupportedFinancialText } from "@joint/contracts";
import {
  checkedMoney,
  londonToday,
  parseBookedDate,
  parseCsvAmount,
} from "./transaction-normalisation.js";

function normalized(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

type BalanceCandidate = {
  format: CsvMapping["dateFormat"];
  separator: CsvMapping["decimalSeparator"];
  ascending: boolean;
  sign: 1 | -1;
  previous?: { date: string; balance: bigint; amount: bigint };
  closing?: { date: string; balance: bigint };
};

export class CsvStatementBalance {
  private readonly width: number;
  private readonly balanceIndex: number | undefined;
  private readonly closingHeader: boolean;
  private readonly today = londonToday();
  private balanceRows = 0;
  private separatorsEquivalent = true;
  private candidates: BalanceCandidate[] = [];

  constructor(
    columns: CsvColumn[],
    private readonly mapping: CsvMappingSuggestion,
  ) {
    this.width = columns.length;
    const balances = columns.filter((column) =>
      ["closing balance", "running balance"].includes(normalized(column.label)),
    );
    this.balanceIndex = balances.length === 1 ? balances[0]?.index : undefined;
    this.closingHeader =
      balances.length === 1 &&
      normalized(balances[0]!.label) === "closing balance";
    if (
      this.balanceIndex !== undefined &&
      this.mapping.date !== undefined &&
      this.mapping.description !== undefined &&
      this.mapping.currency != null &&
      this.mapping.amountMode
    ) {
      for (const format of ["ISO", "DMY", "MDY"] as const)
        for (const separator of ["DOT", "COMMA"] as const)
          for (const ascending of [true, false])
            for (const sign of (this.mapping.amountMode === "SIGNED"
              ? [1, -1]
              : [1]) as (1 | -1)[])
              this.candidates.push({ format, separator, ascending, sign });
    }
  }

  observe(cells: string[]): void {
    this.balanceRows++;
    const indexes = [
      this.balanceIndex,
      this.mapping.amount,
      this.mapping.debit,
      this.mapping.credit,
    ];
    for (const index of indexes) {
      if (index == null) continue;
      const value = (cells[index] ?? "").trim() || "0";
      if (parseCsvAmount(value, "DOT") !== parseCsvAmount(value, "COMMA"))
        this.separatorsEquivalent = false;
    }
    this.candidates = this.candidates.filter((candidate) => {
      if (
        cells.length !== this.width ||
        this.balanceIndex === undefined ||
        this.mapping.date === undefined ||
        this.mapping.description === undefined ||
        this.mapping.currency == null
      )
        return false;
      const description = (cells[this.mapping.description] ?? "").trim();
      const date = parseBookedDate(
        cells[this.mapping.date] ?? "",
        candidate.format,
      );
      const balance = parseCsvAmount(
        cells[this.balanceIndex] ?? "",
        candidate.separator,
      );
      if (
        !date ||
        date > this.today ||
        !description ||
        description.length > 500 ||
        !isSupportedFinancialText(description) ||
        (cells[this.mapping.currency] ?? "").trim().toUpperCase() !== "GBP" ||
        balance === null ||
        !checkedMoney(balance)
      )
        return false;
      let amount: bigint;
      if (this.mapping.amountMode === "SIGNED") {
        const value = parseCsvAmount(
          cells[this.mapping.amount!] ?? "",
          candidate.separator,
        );
        if (value === null) return false;
        amount = value * BigInt(candidate.sign);
      } else {
        const debit = parseCsvAmount(
          (cells[this.mapping.debit!] ?? "").trim() || "0",
          candidate.separator,
        );
        const credit = parseCsvAmount(
          (cells[this.mapping.credit!] ?? "").trim() || "0",
          candidate.separator,
        );
        if (
          debit === null ||
          credit === null ||
          debit < 0n ||
          credit < 0n ||
          (debit !== 0n && credit !== 0n)
        )
          return false;
        amount = credit - debit;
      }
      if (!checkedMoney(amount)) return false;
      const previous = candidate.previous;
      if (
        previous &&
        (candidate.ascending
          ? date < previous.date || balance !== previous.balance + amount
          : date > previous.date ||
            previous.balance !== balance + previous.amount)
      )
        return false;
      candidate.previous = { date, balance, amount };
      if (!candidate.closing || candidate.ascending)
        candidate.closing = { date, balance };
      return true;
    });
  }

  result(
    sourceIdsValid: boolean,
  ):
    | { money: { amountMinor: string; currency: "GBP" }; asOfDate: string }
    | undefined {
    if (
      !this.balanceRows ||
      !sourceIdsValid ||
      (this.balanceRows === 1 && !this.closingHeader)
    )
      return undefined;
    if (
      new Set(this.candidates.map((candidate) => candidate.format)).size !==
        1 ||
      (new Set(this.candidates.map((candidate) => candidate.separator)).size !==
        1 &&
        !this.separatorsEquivalent) ||
      (this.balanceRows > 1 &&
        new Set(this.candidates.map((candidate) => candidate.sign)).size !== 1)
    )
      return undefined;
    const results = new Map<
      string,
      { money: { amountMinor: string; currency: "GBP" }; asOfDate: string }
    >();
    for (const candidate of this.candidates) {
      if (!candidate.closing) continue;
      const money = checkedMoney(candidate.closing.balance);
      if (!money) continue;
      const result = { money, asOfDate: candidate.closing.date };
      results.set(JSON.stringify(result), result);
    }
    return results.size === 1 ? [...results.values()][0] : undefined;
  }
}
