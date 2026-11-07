import { existsSync } from "node:fs";
import { expect, it, vi } from "vitest";
import * as contracts from "../packages/contracts/src/index.js";
import { sourceExports } from "./fixtures/native-source-harness.js";

type File = typeof import("../apps/mobile/src/features/imports/import-file.js");
type Mapping =
  typeof import("../apps/mobile/src/features/imports/import-mapping.js");
const filePath = "apps/mobile/src/features/imports/import-file.ts";
const mappingPath = "apps/mobile/src/features/imports/import-mapping.ts";
function file(): File {
  expect(existsSync(filePath), "import file module exists").toBe(true);
  return sourceExports(filePath, { "@joint/contracts": contracts }) as File;
}
function mapping(): Mapping {
  expect(existsSync(mappingPath), "import mapping module exists").toBe(true);
  return sourceExports(mappingPath, {
    "@joint/contracts": contracts,
  }) as Mapping;
}
const asset = {
  name: "statement.csv",
  uri: "file:///var/mobile/Containers/cache/statement.csv",
  size: 1200,
  mimeType: "text/csv",
};

it("accepts a csv file within the bounds and refuses everything else before reading it", () => {
  const api = file();
  expect(api.pickedFileProblem(asset)).toBeNull();
  expect(api.pickedFileProblem({ ...asset, name: "STATEMENT.CSV" })).toBeNull();
  expect(api.pickedFileProblem({ ...asset, size: undefined })).toBeNull();
  for (const bad of [
    { ...asset, name: "statement.xlsx" },
    { ...asset, name: "statement.csv.exe" },
    { ...asset, name: ".csv" },
    { ...asset, size: 0 },
    { ...asset, size: contracts.MAX_CSV_BYTES + 1 },
    { ...asset, uri: "https://example.test/statement.csv" },
    { ...asset, uri: "content://provider/statement.csv" },
    { ...asset, uri: "file:///a/../b.csv" },
  ])
    expect(api.pickedFileProblem(bad), JSON.stringify(bad)).toEqual(
      expect.any(String),
    );
  expect(
    api.pickedFileProblem({ ...asset, size: contracts.MAX_CSV_BYTES }),
  ).toBeNull();
});

it("reads the picked file once through the injected reader and re-checks its real size", async () => {
  const api = file();
  const reader = vi.fn(
    async () => new TextEncoder().encode("a,b\n1,2\n").buffer,
  );
  const out = await api.readCsvBytes(
    asset,
    new AbortController().signal,
    reader,
  );
  expect(out).toMatchObject({ ok: true });
  expect(out.ok && new TextDecoder().decode(out.value)).toBe("a,b\n1,2\n");
  expect(reader).toHaveBeenCalledWith(asset.uri, expect.any(AbortSignal));
  expect(
    await api.readCsvBytes(
      asset,
      new AbortController().signal,
      async () => new ArrayBuffer(0),
    ),
  ).toMatchObject({ ok: false });
  expect(
    await api.readCsvBytes(
      asset,
      new AbortController().signal,
      async () => new ArrayBuffer(contracts.MAX_CSV_BYTES + 1),
    ),
  ).toMatchObject({ ok: false });
  expect(
    await api.readCsvBytes(asset, new AbortController().signal, async () => {
      throw new Error("/private/path/leak");
    }),
  ).toEqual({ ok: false, message: expect.not.stringContaining("private") });
});

it("never reads a file whose metadata is already refused", async () => {
  const api = file();
  const reader = vi.fn();
  expect(
    await api.readCsvBytes(
      { ...asset, uri: "https://example.test/x.csv" },
      new AbortController().signal,
      reader,
    ),
  ).toMatchObject({ ok: false });
  expect(reader).not.toHaveBeenCalled();
});

it("does not hand back bytes when the read was cancelled", async () => {
  const api = file();
  const abort = new AbortController();
  const out = await api.readCsvBytes(asset, abort.signal, async () => {
    abort.abort();
    return new ArrayBuffer(4);
  });
  expect(out).toMatchObject({ ok: false });
});

function draft(overrides: Record<string, string> = {}) {
  return {
    amountMode: "SIGNED",
    date: "0",
    description: "1",
    amount: "2",
    debit: "",
    credit: "",
    currency: "",
    sourceId: "",
    dateFormat: "ISO",
    decimalSeparator: "DOT",
    positiveIs: "INFLOW",
    ...overrides,
  };
}

it("builds a signed-amount mapping with explicit conventions", () => {
  expect(mapping().mappingInput(draft() as never, 3)).toEqual({
    ok: true,
    value: {
      date: 0,
      description: 1,
      amount: 2,
      debit: null,
      credit: null,
      currency: null,
      sourceId: null,
      dateFormat: "ISO",
      decimalSeparator: "DOT",
      amountMode: "SIGNED",
      positiveIs: "INFLOW",
    },
  });
});

it("builds a debit and credit mapping and ignores a stale signed column", () => {
  const out = mapping().mappingInput(
    draft({
      amountMode: "DEBIT_CREDIT",
      amount: "2",
      debit: "2",
      credit: "3",
      positiveIs: "OUTFLOW",
    }) as never,
    4,
  );
  expect(out).toMatchObject({
    ok: true,
    value: { amount: null, debit: 2, credit: 3, positiveIs: "INFLOW" },
  });
});

it("refuses unset conventions, duplicate columns and columns the file does not have", () => {
  const api = mapping();
  for (const bad of [
    draft({ amountMode: "" }),
    draft({ dateFormat: "" }),
    draft({ decimalSeparator: "" }),
    draft({ positiveIs: "" }),
    draft({ date: "" }),
    draft({ description: "0" }),
    draft({ amount: "" }),
    draft({ amountMode: "DEBIT_CREDIT", debit: "2", credit: "2" }),
    draft({ amount: "7" }),
    draft({ amount: "-1" }),
    draft({ amount: "1.5" }),
  ])
    expect(
      api.mappingInput(bad as never, 3),
      JSON.stringify(bad),
    ).toMatchObject({ ok: false });
});

it("lists the file's own columns as choices with a clear unset option", () => {
  const out = mapping().columnChoices([
    { index: 0, label: "Date" },
    { index: 1, label: "Details" },
  ]);
  expect(out.options).toEqual(["", "0", "1"]);
  expect(out.labels).toEqual({
    "": "Not used",
    "0": "Column 1: Date",
    "1": "Column 2: Details",
  });
});
