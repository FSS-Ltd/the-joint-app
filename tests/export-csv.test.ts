import { describe, expect, it } from "vitest";
import {
  encodeExportRow,
  exportCsvHeader,
  spreadsheetText,
} from "../apps/worker/src/exports/csv.js";

describe("financial CSV export", () => {
  it.each(["=1+1", "+SUM(A1)", "-1+2", "@SUM(A1)", " \t=1", "\u200b=1"])(
    "neutralises a formula-like text cell %j",
    (value) => expect(spreadsheetText(value)).toBe(`'${value}`),
  );

  it("preserves quotes, Unicode, commas and newlines as a single quoted cell", () => {
    expect(spreadsheetText('Family, "café"\nnext line')).toBe(
      'Family, "café"\nnext line',
    );
    const row = encodeExportRow({
      recordType: "TRANSACTION",
      accountId: "6d73965b-0dab-427b-8a5b-4908a2a07828",
      recordId: "d3a0fecd-6caa-42d2-ac6d-b0cf629e6a85",
      date: "2026-01-10",
      amountMinor: "-9223372036854775808",
      currency: "GBP",
      description: 'Family, "café"\nnext line',
      note: '=HYPERLINK("https://invalid.example")',
    });
    expect(row).toContain('"Family, ""café""\nnext line"');
    expect(row).toContain('"\'=HYPERLINK(""https://invalid.example"")"');
    expect(row).toContain(',"-9223372036854775808","GBP",');
    expect(row.endsWith("\r\n")).toBe(true);
    expect(exportCsvHeader.endsWith("\r\n")).toBe(true);
  });

  it("rejects an unsafe or noncanonical numeric column instead of emitting formulas", () => {
    for (const amountMinor of ["=1+1", "01", "-0", "1.2", "1e3"])
      expect(() =>
        encodeExportRow({
          recordType: "BALANCE",
          accountId: "6d73965b-0dab-427b-8a5b-4908a2a07828",
          recordId: "d3a0fecd-6caa-42d2-ac6d-b0cf629e6a85",
          amountMinor,
        }),
      ).toThrow("Invalid export amount");
  });
});
