import { afterEach, beforeEach, expect, it, vi } from "vitest";
import * as contracts from "../packages/contracts/src/index.js";
import * as errors from "../apps/mobile/src/features/finance/errors.js";
import * as result from "../apps/mobile/src/features/finance/result.js";
import { financeFixture } from "./fixtures/native-finance.js";
import { account } from "./fixtures/native-read-ui.js";
import { sourceExports } from "./fixtures/native-source-harness.js";

/** Local shape: importing the hook module would pull React Native globals into the root test project. */
interface ImportFlow {
  allowed: boolean;
  editable: boolean;
  draft: {
    value: {
      file: { name: string; bytes: Uint8Array<ArrayBuffer> } | null;
      inspection: unknown;
    };
    message: string;
    change(value: unknown): void;
  };
  mutation: { kind: string; retry(): Promise<void> };
  chooseFile(): Promise<void>;
  editAgain(): void;
  inspect(): Promise<void>;
  changeMapping(mapping: unknown): void;
  submit(): Promise<void>;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(0);
});
afterEach(() => vi.useRealTimers());

const key = "99999999-9999-4999-8999-999999999999";
const file = {
  name: "statement.csv",
  uri: "file:///cache/statement.csv",
  size: 20,
};
const batch = (accountId: string): contracts.ImportBatchResponse => ({
  id: "11111111-1111-4111-8111-111111111111",
  accountId,
  state: "QUEUED",
  version: 1,
  totalRows: 0,
  processedRows: 0,
  validRows: 0,
  rejectedRows: 0,
  overlapRows: 0,
  duplicateRows: 0,
  committedRows: 0,
  skippedRows: 0,
  failureCode: null,
  createdAt: "2026-11-04T10:00:00.000Z",
  committedAt: null,
  rolledBackAt: null,
  originalExpiresAt: null,
  originalAvailable: true,
  permissions: {
    canCommit: false,
    canRollback: false,
    canRestore: false,
    canDeleteOriginal: true,
  },
});
const mapped = {
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
} as const;
const inspection = {
  columns: [
    { index: 0, label: "Date" },
    { index: 1, label: "Details" },
    { index: 2, label: "Amount" },
  ],
  rowCount: 2,
};

async function setup(owned = true) {
  const f = await financeFixture();
  const item = account({
    householdId: f.finance.authority.householdId,
    ownership: owned ? "OWNED" : "SHARED",
  });
  const inspect = vi.fn<(...args: unknown[]) => Promise<typeof inspection>>(
    async () => inspection,
  );
  const preview = vi.fn<(...args: unknown[]) => Promise<unknown>>(async () => ({
    batch: batch(item.id),
    jobId: key,
  }));
  f.replaceFinance({
    ...f.finance,
    imports: { ...f.finance.imports, inspect, preview } as never,
  });
  const deps = {
    react: f.h.react,
    "react-native": { AppState: f.h.appState },
    "expo-router": f.h.router,
    "../finance/context": { useNativeFinance: () => f.finance },
  };
  const lifetime = sourceExports(
    "apps/mobile/src/features/finance/use-lifetime.ts",
    deps,
  );
  const draft = sourceExports(
    "apps/mobile/src/features/accounts/use-write-draft.ts",
    { ...deps, "../finance/use-lifetime": lifetime },
  );
  const fileModule = sourceExports(
    "apps/mobile/src/features/imports/import-file.ts",
    { "@joint/contracts": contracts },
  );
  const mappingModule = sourceExports(
    "apps/mobile/src/features/imports/import-mapping.ts",
    { "@joint/contracts": contracts },
  );
  const intent = sourceExports(
    "apps/mobile/src/features/imports/import-intent.ts",
    {
      "@joint/contracts": contracts,
      "../finance/errors": errors,
      "../accounts/write-intent": sourceExports(
        "apps/mobile/src/features/accounts/write-intent.ts",
        {
          "@joint/contracts": contracts,
          "../finance/result": result,
          "../finance/errors": errors,
        },
      ),
    },
  );
  const picked = { current: file as typeof file | null };
  const discarded = vi.fn();
  const content = { current: new TextEncoder().encode("a,b,c\n1,2,3\n") };
  const hook = sourceExports(
    "apps/mobile/src/features/imports/use-import-flow.ts",
    {
      ...deps,
      "expo-crypto": { randomUUID: () => key },
      "../finance/errors": errors,
      "../finance/use-mutation": { useFinanceMutation: f.mutation },
      "../finance/use-resource": {
        useFinanceResource: () => ({
          kind: "ready",
          value: item,
          current: () => item,
          retry: vi.fn(),
        }),
      },
      "../accounts/use-write-draft": draft,
      "./import-file": fileModule,
      "./import-intent": intent,
      "./import-mapping": mappingModule,
      "./import-picker": {
        pickCsvFile: async () => picked.current,
        discardLocalFile: discarded,
        readLocalFile: async () => content.current.buffer,
      },
    },
  ).useImportFlow as (id: string) => ImportFlow;
  const render = () => f.h.render(() => hook(item.id));
  render();
  return { f, item, inspect, preview, picked, content, discarded, render };
}

it("reads a chosen csv into the draft, resetting any earlier inspection and mapping", async () => {
  const s = await setup();
  await s.render().chooseFile();
  const view = s.render();
  expect(view.draft.value.file?.name).toBe("statement.csv");
  expect(new TextDecoder().decode(view.draft.value.file?.bytes)).toBe(
    "a,b,c\n1,2,3\n",
  );
  expect(view.draft.value.inspection).toBeNull();
  s.f.close();
});

it("keeps the draft unchanged when the picker is cancelled or the file is refused", async () => {
  const s = await setup();
  s.picked.current = null;
  await s.render().chooseFile();
  expect(s.render().draft.value.file).toBeNull();
  s.picked.current = { ...file, name: "statement.xlsx" };
  await s.render().chooseFile();
  expect(s.render().draft.value.file).toBeNull();
  expect(s.render().draft.message).not.toBe("");
  s.f.close();
});

it("inspects the held bytes once and stores the columns, never inspecting without a file", async () => {
  const s = await setup();
  await s.render().inspect();
  expect(s.inspect).not.toHaveBeenCalled();
  await s.render().chooseFile();
  await s.render().inspect();
  expect(s.inspect).toHaveBeenCalledOnce();
  expect(s.inspect.mock.calls[0]).toMatchObject([
    s.f.finance.authority.householdId,
    s.item.id,
    expect.any(Uint8Array),
    expect.any(AbortSignal),
  ]);
  expect(s.render().draft.value.inspection).toEqual(inspection);
  s.f.close();
});

it("refuses an incomplete mapping without any upload, then previews once with one key", async () => {
  const s = await setup();
  await s.render().chooseFile();
  await s.render().inspect();
  await s.render().submit();
  expect(s.preview).not.toHaveBeenCalled();
  expect(s.render().draft.message).not.toBe("");
  s.render().changeMapping({ ...mapped });
  await s.render().submit();
  expect(s.preview).toHaveBeenCalledOnce();
  const call = s.preview.mock.calls[0] as unknown[];
  expect(call.slice(0, 2)).toEqual([
    s.f.finance.authority.householdId,
    s.item.id,
  ]);
  expect(call[3]).toMatchObject({ date: 0, description: 1, amount: 2 });
  expect(call[4]).toBe(key);
  await s.render().submit();
  expect(s.preview).toHaveBeenCalledOnce();
  s.f.close();
});

it("releases the file bytes as soon as the upload is accepted", async () => {
  const s = await setup();
  await s.render().chooseFile();
  await s.render().inspect();
  s.render().changeMapping({ ...mapped });
  await s.render().submit();
  s.render();
  expect(s.render().mutation.kind).toBe("success");
  expect(s.render().draft.value.file).toBeNull();
  s.f.close();
});

it("replays an uncertain upload with the same key, bytes and mapping", async () => {
  const s = await setup();
  s.preview.mockRejectedValueOnce(
    new errors.NativeApiError(0, undefined, "uncertain"),
  );
  await s.render().chooseFile();
  await s.render().inspect();
  s.render().changeMapping({ ...mapped });
  await s.render().submit();
  expect(s.render().mutation.kind).toBe("uncertain");
  await s.render().mutation.retry();
  expect(s.preview).toHaveBeenCalledTimes(2);
  const [first, second] = s.preview.mock.calls as unknown[][];
  expect(second?.[4]).toBe(first?.[4]);
  expect(second?.[2]).toEqual(first?.[2]);
  expect(second?.[3]).toEqual(first?.[3]);
  s.f.close();
});

it("treats a batch for another account as uncertain", async () => {
  const s = await setup();
  s.preview.mockResolvedValueOnce({
    batch: batch("00000000-0000-4000-8000-0000000000aa"),
    jobId: key,
  });
  await s.render().chooseFile();
  await s.render().inspect();
  s.render().changeMapping({ ...mapped });
  await s.render().submit();
  expect(s.render().mutation.kind).toBe("uncertain");
  s.f.close();
});

it("never offers the flow to a viewer of the account", async () => {
  const s = await setup(false);
  const view = s.render();
  expect(view.allowed).toBe(false);
  expect(view.editable).toBe(false);
  await view.chooseFile();
  await view.submit();
  expect(s.preview).not.toHaveBeenCalled();
  expect(s.render().draft.value.file).toBeNull();
  s.f.close();
});

it("ignores an inspection that finishes after the file was replaced", async () => {
  const s = await setup();
  await s.render().chooseFile();
  let release: (value: typeof inspection) => void = () => {};
  s.inspect.mockImplementationOnce(
    () => new Promise((resolve) => (release = resolve)),
  );
  const pending = s.render().inspect();
  s.content.current = new TextEncoder().encode("x,y,z\n4,5,6\n");
  s.render().draft.change({
    ...s.render().draft.value,
    file: { name: "other.csv", bytes: new Uint8Array(4) },
  });
  // React renders the replaced file before the network response can resolve.
  s.render();
  release(inspection);
  await pending;
  expect(s.render().draft.value.inspection).toBeNull();
  s.f.close();
});

it("deletes the picker's cached copy after every read, including refused files, and never after a cancel", async () => {
  const s = await setup();
  await s.render().chooseFile();
  expect(s.discarded).toHaveBeenCalledWith(file.uri);
  s.picked.current = { ...file, name: "statement.xlsx" };
  await s.render().chooseFile();
  expect(s.discarded).toHaveBeenCalledTimes(2);
  s.picked.current = null;
  await s.render().chooseFile();
  expect(s.discarded).toHaveBeenCalledTimes(2);
  s.f.close();
});

it("lets a rejected upload be edited with the file kept, but never an uncertain one", async () => {
  const s = await setup();
  await s.render().chooseFile();
  await s.render().inspect();
  s.render().changeMapping({ ...mapped });
  s.preview.mockRejectedValueOnce(
    new errors.NativeApiError(400, "INVALID_INPUT"),
  );
  await s.render().submit();
  expect(s.render().mutation.kind).toBe("error");
  s.render().editAgain();
  expect(s.render().mutation.kind).toBe("idle");
  expect(s.render().draft.value.file?.name).toBe("statement.csv");
  expect(s.render().draft.value.inspection).toEqual(inspection);
  s.preview.mockRejectedValueOnce(
    new errors.NativeApiError(0, undefined, "uncertain"),
  );
  await s.render().submit();
  expect(s.render().mutation.kind).toBe("uncertain");
  s.render().editAgain();
  expect(s.render().mutation.kind).toBe("uncertain");
  s.f.close();
});

it("does not open a second picker when two taps land on the same render", async () => {
  const s = await setup();
  const view = s.render();
  await Promise.all([view.chooseFile(), view.chooseFile()]);
  expect(s.discarded).toHaveBeenCalledTimes(1);
  s.f.close();
});
