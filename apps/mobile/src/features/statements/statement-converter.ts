export interface PickedStatementFile {
  name: string;
  uri: string;
  size?: number | undefined;
}

export type ConfidenceLevel = "high" | "needs_review" | "low";

export interface ExtractedStatementRow {
  id: string;
  pageNumber: number;
  lineNumber: number;
  rawText: string;
  date: string; // YYYY-MM-DD
  description: string;
  amountMinor: string; // Signed integer string
  currency: string; // e.g. "GBP"
  direction: "DEBIT" | "CREDIT";
  confidence: ConfidenceLevel;
  confidenceReasons?: string[] | undefined;
  balanceMinor?: string | undefined;
  isExcluded: boolean;
}

export interface StatementSummary {
  openingBalanceMinor?: string | undefined;
  closingBalanceMinor?: string | undefined;
  totalDebitsMinor?: string | undefined;
  totalCreditsMinor?: string | undefined;
}

export interface StatementReconciliation {
  openingBalanceMinor?: string | undefined;
  closingBalanceMinor?: string | undefined;
  totalDebitsMinor?: string | undefined;
  totalCreditsMinor?: string | undefined;
  calculatedDebitsMinor: string;
  calculatedCreditsMinor: string;
  isBalanced: boolean;
  discrepancyMinor?: string | undefined;
}

export interface StatementParseResult {
  rows: ExtractedStatementRow[];
  summary: StatementSummary;
}

export const MAX_STATEMENT_BYTES = 10 * 1024 * 1024; // 10 MiB

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

export function validateStatementFile(
  file: PickedStatementFile,
): string | null {
  if (!/[^/\\]\.pdf$/i.test(file.name)) {
    return "Choose a file with the .pdf extension.";
  }
  if (!localUri(file.uri)) {
    return "That file could not be opened from here.";
  }
  if (file.size !== undefined) {
    if (file.size <= 0) {
      return "That file is empty.";
    }
    if (file.size > MAX_STATEMENT_BYTES) {
      return "Choose a PDF file of 10 MiB or less.";
    }
  }
  return null;
}

function parseAmountToMinor(raw: string): bigint {
  const cleaned = raw.replace(/[£,\s]/g, "");
  const isNegative = cleaned.startsWith("-");
  const numStr = isNegative ? cleaned.slice(1) : cleaned;
  const parts = numStr.split(".");
  const integerPart = BigInt(parts[0] || "0");
  const fractionalPart = BigInt((parts[1] || "").padEnd(2, "0").slice(0, 2));
  const minor = integerPart * 100n + fractionalPart;
  return isNegative ? -minor : minor;
}

function formatMinorToAmountString(minor: bigint): string {
  const isNegative = minor < 0n;
  const absMinor = isNegative ? -minor : minor;
  const intPart = (absMinor / 100n).toString();
  const fracPart = (absMinor % 100n).toString().padStart(2, "0");
  return `${isNegative ? "-" : ""}${intPart}.${fracPart}`;
}

function parseUkDate(dateStr: string): {
  isoDate: string;
  isAmbiguous: boolean;
} | null {
  // Matches DD/MM/YYYY or DD-MM-YYYY
  const slashMatch = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(dateStr.trim());
  if (slashMatch && slashMatch[1] && slashMatch[2] && slashMatch[3]) {
    const first = parseInt(slashMatch[1], 10);
    const second = parseInt(slashMatch[2], 10);
    const year = slashMatch[3];

    // Standard UK format is DD/MM/YYYY
    const day = first;
    const month = second;
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;

    const isoDate = `${year}-${month.toString().padStart(2, "0")}-${day.toString().padStart(2, "0")}`;
    // If day <= 12, it could be interpreted as US MM/DD/YYYY
    const isAmbiguous = first <= 12 && second <= 12 && first !== second;
    return { isoDate, isAmbiguous };
  }

  // Matches YYYY-MM-DD
  const isoMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr.trim());
  if (isoMatch && isoMatch[1] && isoMatch[2] && isoMatch[3]) {
    return { isoDate: dateStr.trim(), isAmbiguous: false };
  }

  return null;
}

interface ColumnPositions {
  dateCol: number;
  descCol: number;
  paidOutCol?: number | undefined;
  paidInCol?: number | undefined;
  amountCol?: number | undefined;
  balanceCol?: number | undefined;
}

export function parseStatementText(text: string): StatementParseResult {
  const lines = text.split(/\r?\n/);
  const rows: ExtractedStatementRow[] = [];
  const summary: StatementSummary = {};

  let columnPositions: ColumnPositions | null = null;
  let hasSplitColumns = false;

  // First pass: detect summary blocks and column structure
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Detect summary amounts
    const openMatch = /Opening\s+Balance:\s*([£]?-?[\d,]+(?:\.\d{2})?)/i.exec(
      trimmed,
    );
    if (openMatch?.[1]) {
      summary.openingBalanceMinor = parseAmountToMinor(openMatch[1]).toString();
    }

    const closeMatch = /Closing\s+Balance:\s*([£]?-?[\d,]+(?:\.\d{2})?)/i.exec(
      trimmed,
    );
    if (closeMatch?.[1]) {
      summary.closingBalanceMinor = parseAmountToMinor(
        closeMatch[1],
      ).toString();
    }

    const totalInMatch = /Total\s+In:\s*([£]?-?[\d,]+(?:\.\d{2})?)/i.exec(
      trimmed,
    );
    if (totalInMatch?.[1]) {
      summary.totalCreditsMinor = parseAmountToMinor(
        totalInMatch[1],
      ).toString();
    }

    const totalOutMatch = /Total\s+Out:\s*([£]?-?[\d,]+(?:\.\d{2})?)/i.exec(
      trimmed,
    );
    if (totalOutMatch?.[1]) {
      summary.totalDebitsMinor = parseAmountToMinor(
        totalOutMatch[1],
      ).toString();
    }

    // Detect table headers and record column offsets
    const splitHeaderMatch =
      /Date.*?(Payment Details|Description).*?(Paid Out|Debit).*?(Paid In|Credit)/i.exec(
        line,
      );
    if (splitHeaderMatch) {
      hasSplitColumns = true;
      const dateCol = line.search(/Date/i);
      const descCol = line.search(/Payment Details|Description/i);
      const paidOutCol = line.search(/Paid Out|Debit/i);
      const paidInCol = line.search(/Paid In|Credit/i);
      const balanceIdx = line.search(/Balance/i);
      const balanceCol = balanceIdx >= 0 ? balanceIdx : undefined;
      columnPositions = {
        dateCol,
        descCol,
        paidOutCol,
        paidInCol,
        balanceCol,
      };
      continue;
    }

    const singleHeaderMatch = /Date.*?(Description|Details).*?Amount/i.exec(
      line,
    );
    if (singleHeaderMatch) {
      hasSplitColumns = false;
      const dateCol = line.search(/Date/i);
      const descCol = line.search(/Description|Details/i);
      const amountCol = line.search(/Amount/i);
      const balanceIdx = line.search(/Balance/i);
      const balanceCol = balanceIdx >= 0 ? balanceIdx : undefined;
      columnPositions = {
        dateCol,
        descCol,
        amountCol,
        balanceCol,
      };
    }
  }

  // Second pass: extract transaction rows
  let rowId = 1;
  let lineNum = 0;
  let pastHeader = false;

  for (const line of lines) {
    lineNum++;
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Detect header line in second pass
    if (/Date.*?(Payment Details|Description|Details)/i.test(line)) {
      pastHeader = true;
      continue;
    }

    // Skip summary lines or lines before header when column positions are known
    if (
      /^(Opening|Closing|Total|Statement Date|Account)/i.test(trimmed) ||
      (columnPositions && !pastHeader)
    ) {
      continue;
    }

    let dateStr: string;
    let description: string;
    let amountMinor = 0n;
    let balanceMinor: string | undefined = undefined;
    let direction: "DEBIT" | "CREDIT" = "DEBIT";

    if (
      columnPositions &&
      hasSplitColumns &&
      columnPositions.paidOutCol &&
      columnPositions.paidInCol
    ) {
      const { descCol, paidOutCol, paidInCol, balanceCol } = columnPositions;
      dateStr = line.slice(0, descCol).trim();
      const dateParsed = parseUkDate(dateStr);
      if (!dateParsed) continue;

      description = line.slice(descCol, paidOutCol).trim();
      const paidOutText = line.slice(paidOutCol, paidInCol).trim();
      const paidInText = balanceCol
        ? line.slice(paidInCol, balanceCol).trim()
        : line.slice(paidInCol).trim();
      const balanceText = balanceCol ? line.slice(balanceCol).trim() : "";

      if (
        paidOutText &&
        /^[\d,]+(\.\d{2})?$/.test(paidOutText.replace(/[£\s]/g, ""))
      ) {
        amountMinor = -parseAmountToMinor(paidOutText);
        direction = "DEBIT";
      } else if (
        paidInText &&
        /^[\d,]+(\.\d{2})?$/.test(paidInText.replace(/[£\s]/g, ""))
      ) {
        amountMinor = parseAmountToMinor(paidInText);
        direction = "CREDIT";
      }

      if (
        balanceText &&
        /^[\d,]+(\.\d{2})?$/.test(balanceText.replace(/[£\s]/g, ""))
      ) {
        balanceMinor = parseAmountToMinor(balanceText).toString();
      }

      let confidence: ConfidenceLevel = "high";
      const confidenceReasons: string[] = [];

      if (dateParsed.isAmbiguous) {
        confidence = "needs_review";
        confidenceReasons.push("Date format could be ambiguous.");
      }

      rows.push({
        id: `stmt-row-${rowId++}`,
        pageNumber: 1,
        lineNumber: lineNum,
        rawText: trimmed,
        date: dateParsed.isoDate,
        description: description || "Transaction",
        amountMinor: amountMinor.toString(),
        currency: "GBP",
        direction,
        confidence,
        confidenceReasons:
          confidenceReasons.length > 0 ? confidenceReasons : undefined,
        balanceMinor,
        isExcluded: false,
      });
      continue;
    } else if (
      columnPositions &&
      !hasSplitColumns &&
      columnPositions.amountCol
    ) {
      const { descCol, amountCol, balanceCol } = columnPositions;
      dateStr = line.slice(0, descCol).trim();
      const dateParsed = parseUkDate(dateStr);
      if (!dateParsed) continue;

      description = line.slice(descCol, amountCol).trim();
      const amountText = balanceCol
        ? line.slice(amountCol, balanceCol).trim()
        : line.slice(amountCol).trim();
      const balanceText = balanceCol ? line.slice(balanceCol).trim() : "";

      if (amountText) {
        amountMinor = parseAmountToMinor(amountText);
        direction = amountMinor < 0n ? "DEBIT" : "CREDIT";
      }

      if (balanceText) {
        balanceMinor = parseAmountToMinor(balanceText).toString();
      }

      let confidence: ConfidenceLevel = "high";
      const confidenceReasons: string[] = [];

      if (dateParsed.isAmbiguous) {
        confidence = "needs_review";
        confidenceReasons.push("Date format could be ambiguous.");
      }

      rows.push({
        id: `stmt-row-${rowId++}`,
        pageNumber: 1,
        lineNumber: lineNum,
        rawText: trimmed,
        date: dateParsed.isoDate,
        description: description || "Transaction",
        amountMinor: amountMinor.toString(),
        currency: "GBP",
        direction,
        confidence,
        confidenceReasons:
          confidenceReasons.length > 0 ? confidenceReasons : undefined,
        balanceMinor,
        isExcluded: false,
      });
      continue;
    }

    // Fallback token split
    const tokens = trimmed.split(/\s{2,}|\t/);
    if (tokens.length < 2) continue;
    dateStr = tokens[0]?.trim() || "";
    const dateParsed = parseUkDate(dateStr);
    if (!dateParsed) continue;

    description = tokens[1]?.trim() || "Transaction";
    const amountToken = tokens[2]?.trim() || "";
    const balanceToken = tokens[3]?.trim() || "";

    if (amountToken) {
      amountMinor = parseAmountToMinor(amountToken);
      direction = amountMinor < 0n ? "DEBIT" : "CREDIT";
    }
    if (balanceToken) {
      balanceMinor = parseAmountToMinor(balanceToken).toString();
    }

    let confidence: ConfidenceLevel = "high";
    const confidenceReasons: string[] = [];

    if (dateParsed.isAmbiguous) {
      confidence = "needs_review";
      confidenceReasons.push("Date format could be ambiguous.");
    }

    rows.push({
      id: `stmt-row-${rowId++}`,
      pageNumber: 1,
      lineNumber: lineNum,
      rawText: trimmed,
      date: dateParsed.isoDate,
      description: description || "Transaction",
      amountMinor: amountMinor.toString(),
      currency: "GBP",
      direction,
      confidence,
      confidenceReasons:
        confidenceReasons.length > 0 ? confidenceReasons : undefined,
      balanceMinor,
      isExcluded: false,
    });
  }

  return { rows, summary };
}

export function reconcileStatementRows(
  rows: ExtractedStatementRow[],
  summary: StatementSummary,
): StatementReconciliation {
  let calculatedDebits = 0n;
  let calculatedCredits = 0n;

  for (const row of rows) {
    if (row.isExcluded) continue;
    const amt = BigInt(row.amountMinor);
    if (amt < 0n) {
      calculatedDebits += -amt;
    } else {
      calculatedCredits += amt;
    }
  }

  let isBalanced = true;
  let discrepancyMinor: string | undefined = undefined;

  if (summary.totalDebitsMinor) {
    if (BigInt(summary.totalDebitsMinor) !== calculatedDebits) {
      isBalanced = false;
    }
  }
  if (summary.totalCreditsMinor) {
    if (BigInt(summary.totalCreditsMinor) !== calculatedCredits) {
      isBalanced = false;
    }
  }
  if (summary.openingBalanceMinor && summary.closingBalanceMinor) {
    const expectedClosing =
      BigInt(summary.openingBalanceMinor) +
      calculatedCredits -
      calculatedDebits;
    const actualClosing = BigInt(summary.closingBalanceMinor);
    if (expectedClosing !== actualClosing) {
      isBalanced = false;
      discrepancyMinor = (actualClosing - expectedClosing).toString();
    }
  }

  return {
    openingBalanceMinor: summary.openingBalanceMinor,
    closingBalanceMinor: summary.closingBalanceMinor,
    totalDebitsMinor: summary.totalDebitsMinor,
    totalCreditsMinor: summary.totalCreditsMinor,
    calculatedDebitsMinor: calculatedDebits.toString(),
    calculatedCreditsMinor: calculatedCredits.toString(),
    isBalanced,
    discrepancyMinor,
  };
}

export function escapeCsvField(field: string): string {
  // Neutralize CSV formula injection attacks
  let sanitized = field;
  if (/^[\s\p{Cc}\p{Cf}]*[=+\-@\t\r]/u.test(sanitized)) {
    sanitized = `'${sanitized}`;
  }

  // Escape quotes and wrap if commas, quotes, tabs, or newlines present
  if (/[",\r\n\t]/.test(sanitized)) {
    return `"${sanitized.replace(/"/g, '""')}"`;
  }
  return sanitized;
}

export function convertRowsToCsv(rows: ExtractedStatementRow[]): string {
  const header = "Date,Description,Amount,Currency";
  const lines = [header];

  for (const row of rows) {
    if (row.isExcluded) continue;
    const date = escapeCsvField(row.date);
    const desc = escapeCsvField(row.description);
    const amount = formatMinorToAmountString(BigInt(row.amountMinor));
    const currency = escapeCsvField(row.currency);
    lines.push(`${date},${desc},${amount},${currency}`);
  }

  return lines.join("\n") + "\n";
}

function unescapePdfString(str: string): string {
  return str
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "\r")
    .replace(/\\t/g, "\t")
    .replace(/\\([()])/g, "$1")
    .replace(/\\\\/g, "\\");
}

function parsePdfTextCommands(stream: string): string {
  const lines: string[] = [];
  const cmdRegex =
    /(\((?:[^()\\]|\\.)*\)\s*Tj)|(\[[^\]]*\]\s*TJ)|(T\*|-?\d+(?:\.\d+)?\s+-?\d+(?:\.\d+)?\s+T[dD])|(ET)/g;
  let cmdMatch: RegExpExecArray | null;
  let currentLine = "";

  while ((cmdMatch = cmdRegex.exec(stream)) !== null) {
    const tj = cmdMatch[1];
    const tJ = cmdMatch[2];
    const newLineCmd = cmdMatch[3];
    const endTextCmd = cmdMatch[4];

    if (tj) {
      const textMatch = /\(((?:[^()\\]|\\.)*)\)\s*Tj/.exec(tj);
      if (textMatch?.[1]) {
        currentLine += unescapePdfString(textMatch[1]) + " ";
      }
    } else if (tJ) {
      const strParts = tJ.match(/\((?:[^()\\]|\\.)*\)/g);
      if (strParts) {
        for (const part of strParts) {
          const inner = part.slice(1, -1);
          currentLine += unescapePdfString(inner);
        }
        currentLine += " ";
      }
    } else if (newLineCmd || endTextCmd) {
      if (currentLine.trim()) {
        lines.push(currentLine.trim());
      }
      currentLine = "";
    }
  }

  if (currentLine.trim()) lines.push(currentLine.trim());
  return lines.join("\n");
}

export async function extractTextFromPdfBytes(
  bytes: Uint8Array,
  signal?: AbortSignal,
): Promise<{ text: string; pageCount: number; isEncrypted: boolean }> {
  if (signal?.aborted) {
    throw new Error("Extraction cancelled.");
  }

  if (bytes.byteLength === 0) {
    throw new Error("That file is empty.");
  }
  if (bytes.byteLength > MAX_STATEMENT_BYTES) {
    throw new Error("Choose a PDF file of 10 MiB or less.");
  }

  const decoder = new TextDecoder("latin1");
  const header = decoder.decode(bytes.slice(0, 1024));
  if (!header.startsWith("%PDF-")) {
    throw new Error("Invalid PDF header.");
  }

  const trailer = decoder.decode(bytes.slice(-2048));
  if (header.includes("/Encrypt") || trailer.includes("/Encrypt")) {
    return { text: "", pageCount: 0, isEncrypted: true };
  }

  const fullText = decoder.decode(bytes);
  let extracted = "";
  const pageMatches = fullText.match(/\/Type\s*\/Page\b/g);
  const pageCount = pageMatches ? pageMatches.length : 1;

  const streamRegex = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
  let match: RegExpExecArray | null;

  while ((match = streamRegex.exec(fullText)) !== null) {
    if (signal?.aborted) {
      throw new Error("Extraction cancelled.");
    }
    const rawStream = match[1] || "";
    if (rawStream.includes("BT") && rawStream.includes("ET")) {
      extracted += parsePdfTextCommands(rawStream) + "\n";
    }
  }

  if (!extracted.trim()) {
    extracted = parsePdfTextCommands(fullText);
  }

  return {
    text: extracted,
    pageCount: Math.max(1, pageCount),
    isEncrypted: false,
  };
}
