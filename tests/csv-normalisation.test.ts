import { expect, it } from "vitest";
import type { CsvMapping } from "../packages/contracts/dist/index.js";
import { inspectCsv, normalizeCsv } from "../packages/domain/src/csv.js";

const encode = (value: string) => new TextEncoder().encode(value);
const mapping: CsvMapping = {
  date: 0,
  description: 1,
  amount: 2,
  debit: null,
  credit: null,
  currency: 3,
  sourceId: null,
  dateFormat: "DMY",
  decimalSeparator: "DOT",
  amountMode: "SIGNED",
  positiveIs: "INFLOW",
};
it("keeps two legitimate equal purchases, quoted commas/newlines and UTF-8 BOM", async () => {
  const result = await normalizeCsv(
    encode(
      '\ufeffDate,Description,Amount,Currency\r\n03/04/2026,"Cafe, local",-4.50,GBP\r\n03/04/2026,"Cafe, local",-4.50,GBP\r\n04/04/2026,"Two\nlines",1.20,GBP\r\n',
    ),
    mapping,
    "2026-10-23",
  );
  expect(result.rows).toHaveLength(3);
  expect(result.rows[0]).toMatchObject({
    rowNumber: 1,
    status: "VALID",
    bookedDate: "2026-04-03",
    money: { amountMinor: "-450", currency: "GBP" },
    decision: "KEEP",
    duplicate: false,
  });
  expect(result.rows[1]).toMatchObject({
    rowNumber: 2,
    status: "VALID",
    money: { amountMinor: "-450" },
  });
  expect(result.rows[2]).toMatchObject({
    status: "VALID",
    description: "Two\nlines",
  });
});
it("requires explicit date and decimal/sign conventions without floating point", async () => {
  const data = encode(
    'Date,Description,Amount,Currency\n03/04/2026,Shop,"1,234.56",GBP',
  );
  const uk = await normalizeCsv(data, mapping, "2026-10-23");
  const us = await normalizeCsv(
    data,
    { ...mapping, dateFormat: "MDY", positiveIs: "OUTFLOW" },
    "2026-10-23",
  );
  expect(uk.rows[0]).toMatchObject({
    bookedDate: "2026-04-03",
    money: { amountMinor: "123456" },
  });
  expect(us.rows[0]).toMatchObject({
    bookedDate: "2026-03-04",
    money: { amountMinor: "-123456" },
  });
  const euro = await normalizeCsv(
    encode('Date,Description,Amount,Currency\n03/04/2026,Shop,"1.234,56",GBP'),
    { ...mapping, decimalSeparator: "COMMA" },
    "2026-10-23",
  );
  expect(euro.rows[0]).toMatchObject({ money: { amountMinor: "123456" } });
});
it("retains row numbers and actionable rejects rather than silently dropping input", async () => {
  const result = await normalizeCsv(
    encode(
      "Date,Description,Amount,Currency\n31/02/2026,A,1.00,GBP\n01/01/2026,B,1.005,GBP\n01/01/2026,C,1.00,USD\n01/01/2026,\n\n24/10/2026,D,1.00,GBP",
    ),
    mapping,
    "2026-10-23",
  );
  expect(result.rows).toEqual([
    { rowNumber: 1, status: "REJECTED", reason: "INVALID_DATE" },
    { rowNumber: 2, status: "REJECTED", reason: "INVALID_AMOUNT" },
    { rowNumber: 3, status: "REJECTED", reason: "UNSUPPORTED_CURRENCY" },
    { rowNumber: 4, status: "REJECTED", reason: "COLUMN_COUNT" },
    { rowNumber: 5, status: "REJECTED", reason: "COLUMN_COUNT" },
    { rowNumber: 6, status: "REJECTED", reason: "FUTURE_DATE" },
  ]);
});
it("normalises separate debit/credit exactly and rejects two nonzero sides", async () => {
  const value: CsvMapping = {
    ...mapping,
    amountMode: "DEBIT_CREDIT",
    amount: null,
    debit: 2,
    credit: 3,
    currency: 4,
  };
  const result = await normalizeCsv(
    encode(
      "Date,Description,Debit,Credit,Currency\n01/01/2026,A,12.34,,GBP\n01/01/2026,B,,56.78,GBP\n01/01/2026,C,1.00,2.00,GBP",
    ),
    value,
    "2026-10-23",
  );
  expect(result.rows[0]).toMatchObject({ money: { amountMinor: "-1234" } });
  expect(result.rows[1]).toMatchObject({ money: { amountMinor: "5678" } });
  expect(result.rows[2]).toEqual({
    rowNumber: 3,
    status: "REJECTED",
    reason: "AMBIGUOUS_AMOUNT",
  });
});
it("rejects malformed encoding/quoting and oversize files without returning raw cells", async () => {
  for (const bytes of [
    new Uint8Array([0xff]),
    encode('Date,Description,Amount\n"synthetic-private-cell'),
    new Uint8Array(10 * 1024 * 1024 + 1),
  ])
    await expect(inspectCsv(bytes)).rejects.toThrow(/^CSV_/);
});
it("accepts 50,000 records and rejects 50,001 using the actual parser", async () => {
  const header = "Date,Description,Amount,Currency\n";
  const row = "01/01/2026,Cafe,-4.50,GBP\n";
  expect((await inspectCsv(encode(header + row.repeat(50_000)))).rowCount).toBe(
    50_000,
  );
  await expect(inspectCsv(encode(header + row.repeat(50_001)))).rejects.toThrow(
    "CSV_TOO_MANY_ROWS",
  );
});
it("rejects database-unsupported text and year zero as durable row errors", async () => {
  const result = await normalizeCsv(
    encode(
      "Date,Description,Amount,Currency,Source\n0000-01-01,Old,1,GBP,a\n2026-01-01,Bad\u0000description,1,GBP,b\n2026-01-01,Good,1,GBP,bad\u0000id",
    ),
    { ...mapping, dateFormat: "ISO", sourceId: 4 },
    "2026-10-23",
  );
  expect(result.rows).toEqual([
    { rowNumber: 1, status: "REJECTED", reason: "INVALID_DATE" },
    { rowNumber: 2, status: "REJECTED", reason: "INVALID_DESCRIPTION" },
    { rowNumber: 3, status: "REJECTED", reason: "INVALID_SOURCE_ID" },
  ]);
});
