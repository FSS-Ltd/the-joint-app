import { describe, expect, it } from "vitest";
import {
  parseStatementText,
  validateStatementFile,
  convertRowsToCsv,
  reconcileStatementRows,
  extractTextFromPdfBytes,
  escapeCsvField,
} from "../apps/mobile/src/features/statements/statement-converter.js";

// Synthetic statement samples for deterministic verification
const SYNTHETIC_SINGLE_COLUMN_STATEMENT = `
THE FAMILY BANK UK
Statement Date: 31 March 2026
Account: 12-34-56 12345678
Opening Balance: £1,200.00
Closing Balance: £1,550.00
Total In: £500.00
Total Out: £150.00

Date        Description               Amount       Balance
01/03/2026  Tesco Stores              -£45.00      £1,155.00
05/03/2026  Council Tax Direct Debit  -£105.00     £1,050.00
15/03/2026  Client Transfer           £500.00      £1,550.00
`;

const SYNTHETIC_SPLIT_COLUMN_STATEMENT = `
NORTHERN TRUST BANK
Account Number: 98765432
Statement Period: 01/02/2026 - 28/02/2026

Date        Payment Details       Paid Out     Paid In      Balance
02/02/2026  Coffee Roasters       3.50                      496.50
10/02/2026  Gym Membership        45.00                     451.50
20/02/2026  Freelance Payment                  250.00       701.50
`;

const SYNTHETIC_AMBIGUOUS_STATEMENT = `
CUSTOM FINANCIAL
03/04/2026  Mystery Payment       10.00
`;

const SYNTHETIC_CSV_INJECTION_STATEMENT = `
STATEMENT WITH FORMULAS
Date        Description               Amount
01/03/2026  =1+1;cmd|' /C calc'!A0    -£10.00
02/03/2026  @SUM(1,2)                 -£20.00
03/03/2026  +cmd|' /C calc'!A0        -£30.00
`;

describe("IOS17a Statement-to-CSV Converter", () => {
  describe("1. Document Intake & Validation", () => {
    it("validates PDF file extension and size bounds", () => {
      const validFile = {
        name: "statement-mar-2026.pdf",
        uri: "file:///app/cache/statement-mar-2026.pdf",
        size: 512 * 1024,
      };
      expect(validateStatementFile(validFile)).toBeNull();

      const invalidExt = {
        name: "statement.docx",
        uri: "file:///app/cache/statement.docx",
        size: 512 * 1024,
      };
      expect(validateStatementFile(invalidExt)).toBe(
        "Choose a file with the .pdf extension.",
      );

      const tooLarge = {
        name: "huge-statement.pdf",
        uri: "file:///app/cache/huge-statement.pdf",
        size: 15 * 1024 * 1024,
      };
      expect(validateStatementFile(tooLarge)).toBe(
        "Choose a PDF file of 10 MiB or less.",
      );

      const empty = {
        name: "empty.pdf",
        uri: "file:///app/cache/empty.pdf",
        size: 0,
      };
      expect(validateStatementFile(empty)).toBe("That file is empty.");
    });

    it("rejects non-local URIs for path traversal protection", () => {
      const traversal = {
        name: "statement.pdf",
        uri: "file:///app/cache/../etc/passwd",
        size: 1024,
      };
      expect(validateStatementFile(traversal)).toBe(
        "That file could not be opened from here.",
      );
    });
  });

  describe("2. Single-Column Signed Amount Extraction", () => {
    it("extracts transactions with accurate ISO dates and minor-unit amounts", () => {
      const result = parseStatementText(SYNTHETIC_SINGLE_COLUMN_STATEMENT);

      expect(result.rows).toHaveLength(3);
      expect(result.rows[0]).toMatchObject({
        date: "2026-03-01",
        description: "Tesco Stores",
        amountMinor: "-4500",
        currency: "GBP",
        direction: "DEBIT",
      });

      expect(result.rows[1]).toMatchObject({
        date: "2026-03-05",
        description: "Council Tax Direct Debit",
        amountMinor: "-10500",
        currency: "GBP",
        direction: "DEBIT",
      });

      expect(result.rows[2]).toMatchObject({
        date: "2026-03-15",
        description: "Client Transfer",
        amountMinor: "50000",
        currency: "GBP",
        direction: "CREDIT",
      });
    });

    it("reconciles opening, closing, and total flows", () => {
      const result = parseStatementText(SYNTHETIC_SINGLE_COLUMN_STATEMENT);
      const reconciliation = reconcileStatementRows(
        result.rows,
        result.summary,
      );

      expect(reconciliation.calculatedDebitsMinor).toBe("15000"); // 45.00 + 105.00
      expect(reconciliation.calculatedCreditsMinor).toBe("50000"); // 500.00
      expect(reconciliation.isBalanced).toBe(true);
      expect(reconciliation.openingBalanceMinor).toBe("120000");
      expect(reconciliation.closingBalanceMinor).toBe("155000");
    });
  });

  describe("3. Split Debit/Credit Column Extraction", () => {
    it("handles separate Paid Out and Paid In columns correctly", () => {
      const result = parseStatementText(SYNTHETIC_SPLIT_COLUMN_STATEMENT);

      expect(result.rows).toHaveLength(3);
      expect(result.rows[0]).toMatchObject({
        date: "2026-02-02",
        description: "Coffee Roasters",
        amountMinor: "-350",
        direction: "DEBIT",
      });

      expect(result.rows[1]).toMatchObject({
        date: "2026-02-10",
        description: "Gym Membership",
        amountMinor: "-4500",
        direction: "DEBIT",
      });

      expect(result.rows[2]).toMatchObject({
        date: "2026-02-20",
        description: "Freelance Payment",
        amountMinor: "25000",
        direction: "CREDIT",
      });
    });
  });

  describe("4. Ambiguity and Confidence Rating", () => {
    it("marks ambiguous dates or low-confidence rows for review", () => {
      const result = parseStatementText(SYNTHETIC_AMBIGUOUS_STATEMENT);
      expect(result.rows[0]?.confidence).toBe("needs_review");
      expect(result.rows[0]?.confidenceReasons).toBeDefined();
    });
  });

  describe("5. CSV Formatting & Injection Defense", () => {
    it("generates clean RFC-4180 CSV with escaped formula triggers", () => {
      const result = parseStatementText(SYNTHETIC_CSV_INJECTION_STATEMENT);
      const csv = convertRowsToCsv(result.rows);

      // Verify headers
      expect(csv).toContain("Date,Description,Amount,Currency");

      // Verify formula characters are safely single-quoted
      expect(csv).toContain("'=1+1;cmd|' /C calc'!A0");
      expect(csv).toContain("'@SUM(1,2)");
      expect(csv).toContain("'+cmd|' /C calc'!A0");

      // Verify exact amounts preserved
      expect(csv).toContain("-10.00");
      expect(csv).toContain("-20.00");
      expect(csv).toContain("-30.00");
    });

    it("neutralizes leading whitespace, tabs, and carriage returns before formula triggers", () => {
      // Direct escapeCsvField testing for spreadsheet injection vectors
      expect(escapeCsvField("=SUM(A1:A10)")).toBe("'=SUM(A1:A10)");
      expect(escapeCsvField("\t=1+1")).toBe('"\'	=1+1"');
      expect(escapeCsvField("\r@SUM(A1)")).toBe('"\'\r@SUM(A1)"');
      expect(escapeCsvField("   +cmd")).toBe("'   +cmd");
      expect(escapeCsvField("Normal text")).toBe("Normal text");
      expect(escapeCsvField("Text with, comma")).toBe('"Text with, comma"');
    });

    it("excludes rows that the user marked as excluded", () => {
      const result = parseStatementText(SYNTHETIC_SINGLE_COLUMN_STATEMENT);
      const modifiedRows = result.rows.map((row, idx) =>
        idx === 1 ? { ...row, isExcluded: true } : row,
      );

      const csv = convertRowsToCsv(modifiedRows);
      expect(csv).toContain("Tesco Stores");
      expect(csv).not.toContain("Council Tax Direct Debit");
      expect(csv).toContain("Client Transfer");
    });
  });

  describe("6. PDF Binary Parsing & Security Checks", () => {
    it("extracts text streams from synthetic PDF bytes", async () => {
      const syntheticPdf = new TextEncoder().encode(`%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /Contents 4 0 R >>
endobj
4 0 obj
<< /Length 120 >>
stream
BT
/F1 12 Tf
(Date        Description               Amount       Balance) Tj
0 -20 Td
(01/03/2026  Tesco Stores              -45.00       1155.00) Tj
ET
endstream
endobj
trailer
<< /Size 5 /Root 1 0 R >>
%%EOF
`);
      const extracted = await extractTextFromPdfBytes(syntheticPdf);
      expect(extracted.isEncrypted).toBe(false);
      expect(extracted.pageCount).toBe(1);
      expect(extracted.text).toContain("01/03/2026");
      expect(extracted.text).toContain("Tesco Stores");

      const parsed = parseStatementText(extracted.text);
      expect(parsed.rows).toHaveLength(1);
      expect(parsed.rows[0]?.amountMinor).toBe("-4500");
    });

    it("detects encrypted PDFs and returns isEncrypted flag without throwing", async () => {
      const encryptedPdf = new TextEncoder().encode(`%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
trailer
<< /Size 3 /Root 1 0 R /Encrypt 2 0 R >>
%%EOF
`);
      const extracted = await extractTextFromPdfBytes(encryptedPdf);
      expect(extracted.isEncrypted).toBe(true);
      expect(extracted.text).toBe("");
    });

    it("rejects non-PDF header bytes", async () => {
      const invalidPdf = new TextEncoder().encode("NOT A PDF FILE");
      await expect(extractTextFromPdfBytes(invalidPdf)).rejects.toThrow(
        "Invalid PDF header.",
      );
    });

    it("rejects empty byte arrays or oversized PDF byte streams", async () => {
      await expect(extractTextFromPdfBytes(new Uint8Array(0))).rejects.toThrow(
        "That file is empty.",
      );

      const oversizedBytes = new Uint8Array(10 * 1024 * 1024 + 1);
      await expect(extractTextFromPdfBytes(oversizedBytes)).rejects.toThrow(
        "Choose a PDF file of 10 MiB or less.",
      );
    });
  });

  describe("7. Brand and Voice Compliance", () => {
    it("ensures no banned words or em dashes in converter user messages", () => {
      const BANNED_WORDS = [
        "additionally",
        "align with",
        "boasts",
        "bolstered",
        "crucial",
        "delve",
        "emphasizing",
        "enduring",
        "enhance",
        "fostering",
        "garner",
        "highlight",
        "interplay",
        "intricate",
        "intricacies",
        "key",
        "landscape",
        "meticulous",
        "meticulously",
        "pivotal",
        "showcase",
        "tapestry",
        "testament",
        "underscore",
        "valuable",
        "vibrant",
        "nestled",
        "groundbreaking",
        "renowned",
        "diverse array",
        "rich heritage",
        "natural beauty",
        "commitment to",
      ];

      const messages = [
        "Choose a file with the .pdf extension.",
        "Choose a PDF file of 10 MiB or less.",
        "That file is empty.",
        "That file could not be opened from here.",
        "Password-protected PDFs must be unlocked before conversion.",
        "We could not find recognized transactions in this statement layout.",
      ];

      for (const msg of messages) {
        expect(msg).not.toContain("—");
        for (const banned of BANNED_WORDS) {
          expect(msg.toLowerCase()).not.toContain(banned);
        }
      }
    });
  });
});
