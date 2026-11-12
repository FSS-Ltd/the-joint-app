import { readFileSync } from "node:fs";
import { expect, it, vi } from "vitest";
import * as contracts from "../packages/contracts/src/index.js";
import * as mapping from "../apps/mobile/src/features/imports/import-mapping.js";
import * as result from "../apps/mobile/src/features/finance/result.js";
import * as accountRouteId from "../apps/mobile/src/features/accounts/route-id.js";
import * as actionInput from "../apps/mobile/src/features/imports/action-input.js";
import * as stateLabels from "../apps/mobile/src/features/imports/import-state-labels.js";
import { load } from "./fixtures/native-read-ui.js";
import { hookHarness } from "./fixtures/native-source-harness.js";
import {
  byLabel,
  expand,
  press,
  session,
} from "./fixtures/native-activity-ui.js";

const feature = "imports/";
const inspection = {
  columns: [
    { index: 0, label: "Date" },
    { index: 1, label: "Details" },
    { index: 2, label: "Amount" },
  ],
  rowCount: 2,
};
function flow(
  value: {
    file?: unknown;
    inspection?: unknown;
    mapping?: Record<string, string>;
  },
  overrides: Record<string, unknown> = {},
) {
  const draftValue = {
    file: null,
    inspection: null,
    mapping: { ...mapping.emptyMapping },
    ...value,
  };
  return {
    ...session({ id: "a" }, draftValue),
    busy: null as string | null,
    localMappingEditable: true,
    preservingDraft: false,
    resource: { kind: "ready", value: { id: "a" }, retry: vi.fn() },
    chooseFile: vi.fn(),
    inspect: vi.fn(),
    changeMapping: vi.fn(),
    ...overrides,
  };
}
function importScreen(
  state: ReturnType<typeof flow>,
  react: unknown = { useState: (initial: unknown) => [initial, vi.fn()] },
) {
  const tree = (
    load(`${feature}import-screen.tsx`, {
      react,
      "./import-boundary": { ImportBoundary: "boundary" },
      "./mapping-fields": { MappingFields: "mapping" },
      "./import-mapping": mapping,
      "./use-import-flow": { useImportFlow: () => state },
      "../statements/use-statement-converter": {
        useStatementConverter: () => ({
          state: {
            status: "idle",
            errorMessage: null,
            file: null,
            rows: [],
            reconciliation: null,
            pageCount: 0,
          },
          pickAndExtract: vi.fn(),
          toggleRowExcluded: vi.fn(),
          updateRow: vi.fn(),
          generateCsvAndHandoff: vi.fn(),
          cancel: vi.fn(),
          reset: vi.fn(),
        }),
      },
      "../statements/statement-review-screen": {
        StatementReviewScreen: () => null,
      },
    }).ImportScreen as (props: { accountId: string }) => unknown
  )({ accountId: "a" });
  return tree;
}
const file = { name: "statement.csv", bytes: new Uint8Array(1200) };

it("shows only the first step until a file is chosen, then the check, then the mapping", () => {
  const first = flow({});
  const tree1 = importScreen(first);
  expect(byLabel(tree1, "Choose a CSV file")).toBeDefined();
  expect(byLabel(tree1, "Check the file")).toBeUndefined();
  press(tree1, "Choose a CSV file");
  expect(first.chooseFile).toHaveBeenCalledOnce();
  const second = flow({ file });
  const tree2 = importScreen(second);
  expect(JSON.stringify(expand(tree2))).toContain("statement.csv");
  expect(byLabel(tree2, "Choose a different file")).toBeDefined();
  press(tree2, "Check the file");
  expect(second.inspect).toHaveBeenCalledOnce();
  expect(expand(tree2).some((e) => e.type === "mapping")).toBe(false);
  const third = flow({ file, inspection });
  const tree3 = importScreen(third);
  expect(byLabel(tree3, "Check the file")).toBeUndefined();
  expect(expand(tree3).some((e) => e.type === "mapping")).toBe(true);
  press(tree3, "Start preview");
  expect(third.submit).toHaveBeenCalledOnce();
});

it("disables every step while busy or after the upload started", () => {
  const busy = flow(
    { file, inspection },
    { editable: false, busy: "inspecting" },
  );
  const tree = importScreen(busy);
  expect(byLabel(tree, "Start preview")?.disabled).toBe(true);
  expect(byLabel(tree, "Choose a different file")?.disabled).toBe(true);
});

function fields(value: mapping.MappingDraft, missingOnly = false) {
  const onChange = vi.fn();
  const tree = (
    load(`${feature}mapping-fields.tsx`, {
      "../accounts/account-choice": { AccountChoice: "choice" },
      "./import-mapping": mapping,
    }).MappingFields as (props: unknown) => unknown
  )({
    value,
    columns: inspection.columns,
    onChange,
    disabled: false,
    missingOnly,
  });
  return { tree, onChange };
}
const signed: mapping.MappingDraft = {
  ...mapping.emptyMapping,
  amountMode: "SIGNED",
};

it("asks for conventions explicitly and shows only the amount columns that apply", () => {
  const signedTree = fields(signed).tree;
  for (const label of [
    "Date column",
    "Description column",
    "Amount layout",
    "Amount column",
    "Date format",
    "Decimal separator",
    "Positive amounts are",
  ])
    expect(byLabel(signedTree, label), label).toBeDefined();
  expect(byLabel(signedTree, "Debit column")).toBeUndefined();
  const split = fields({ ...signed, amountMode: "DEBIT_CREDIT" }).tree;
  expect(byLabel(split, "Debit column")).toBeDefined();
  expect(byLabel(split, "Credit column")).toBeDefined();
  expect(byLabel(split, "Amount column")).toBeUndefined();
  expect(byLabel(split, "Positive amounts are")).toBeUndefined();
  const none = fields(mapping.emptyMapping).tree;
  expect(byLabel(none, "Amount column")).toBeUndefined();
});

it("offers the file's own columns and writes the choice back into the draft", () => {
  const { tree, onChange } = fields(signed);
  const date = byLabel(tree, "Date column");
  expect(date?.options).toEqual(["", "0", "1", "2"]);
  (date?.onChange as (value: string) => void)("1");
  expect(onChange).toHaveBeenCalledWith({ ...signed, date: "1" });
});

function boundary(state: ReturnType<typeof flow>) {
  const replace = vi.fn();
  const tree = (
    load(`${feature}import-boundary.tsx`, {
      "expo-router": { useRouter: () => ({ replace }) },
      "../accounts/write-feedback": { WriteFeedback: "feedback" },
    }).ImportBoundary as (props: unknown) => unknown
  )({
    flow: state,
    children: { type: "form", props: { label: "FORM" } },
  });
  return { tree, replace };
}

it("boundary covers checking, errors, non-owners, a cleared draft and success", () => {
  const ok = flow({});
  expect(expand(boundary(ok).tree).some((e) => e.props.label === "FORM")).toBe(
    true,
  );
  const viewer = flow({}, { allowed: false });
  const out = boundary(viewer);
  press(out.tree, "Choose another account");
  expect(out.replace).toHaveBeenCalledWith("/imports");
  const cleared = flow({});
  cleared.draft.base = null as never;
  press(boundary(cleared).tree, "Reload account");
  expect(cleared.reload).toHaveBeenCalledOnce();
  const failed = flow(
    {},
    { resource: { kind: "error", message: "x", retry: vi.fn() } },
  );
  press(boundary(failed).tree, "Retry account access");
  const done = flow({}, { mutation: { kind: "success", value: { id: "b" } } });
  expect(
    expand(boundary(done).tree).some((e) => e.props.label === "FORM"),
  ).toBe(false);
});

function batchScreen(state: unknown) {
  return (
    load(`${feature}import-batch-screen.tsx`, {
      "./import-state-labels": stateLabels,
      "./action-input": actionInput,
      "expo-router": { useRouter: () => ({ replace: vi.fn() }) },
      "./use-import-batch": { useImportBatch: () => state },
    }).ImportBatchScreen as (props: { batchId: string }) => unknown
  )({ batchId: "b" });
}
const batch = {
  state: "PREVIEWING",
  totalRows: 2000,
  processedRows: 500,
  validRows: 480,
  rejectedRows: 20,
  overlapRows: 3,
  duplicateRows: 1,
  committedRows: 0,
  failureCode: null,
  originalAvailable: true,
  permissions: {
    canCommit: false,
    canRollback: false,
    canRestore: false,
    canDeleteOriginal: false,
  },
};

it("batch screen reports state, progress and counts without an action it cannot take yet", () => {
  const text = JSON.stringify(
    expand(batchScreen({ kind: "ready", value: batch, retry: vi.fn() })),
  );
  for (const part of [
    "Checking rows",
    "500",
    "2,000",
    "480",
    "valid",
    "20",
    "rejected",
    "original is retained",
  ])
    expect(text, part).toContain(part);
  const failed = JSON.stringify(
    expand(
      batchScreen({
        kind: "ready",
        value: { ...batch, state: "FAILED", failureCode: "X" },
        retry: vi.fn(),
      }),
    ),
  );
  expect(failed).toContain("could not finish");
  const retry = vi.fn();
  press(batchScreen({ kind: "error", message: "x", retry }), "Retry import");
  expect(retry).toHaveBeenCalledOnce();
});

it("binds an import result to the requested batch", () => {
  const scope = {
    householdId: "h",
    selector: { kind: "import", householdId: "h", id: "b" },
  };
  expect(() =>
    result.assertFinanceResult({ id: "b" }, scope as never),
  ).not.toThrow();
  expect(() =>
    result.assertFinanceResult({ id: "other" }, scope as never),
  ).toThrow();
});

function accountsScreen(items: unknown[], nextCursor: string | null = null) {
  const push = vi.fn();
  const tree = (
    load(`${feature}import-accounts-screen.tsx`, {
      react: { useState: (initial: unknown) => [initial, vi.fn()] },
      "expo-router": { useRouter: () => ({ push }) },
      "../accounts/account-choice": { AccountChoice: "choice" },
      "../finance/context": {
        useNativeFinance: () => ({
          authority: { householdId: "h" },
          accounts: {},
        }),
      },
      "../finance/use-resource": {
        useFinanceResource: () => ({
          kind: "ready",
          value: { items, nextCursor },
          retry: vi.fn(),
        }),
      },
    }).ImportAccountsScreen as () => unknown
  )();
  return { tree, push };
}

it("account chooser lists only owned accounts and continues to that account's upload", () => {
  const owned = { id: "a", label: "Current", ownership: "OWNED" };
  const shared = { id: "s", label: "Shared", ownership: "SHARED" };
  const { tree, push } = accountsScreen([shared, owned]);
  expect(byLabel(tree, "Account")?.options).toEqual(["a"]);
  press(tree, "Continue");
  expect(push).toHaveBeenCalledWith("/imports/upload/a");
  const none = accountsScreen([shared]);
  expect(JSON.stringify(expand(none.tree))).toContain(
    "No accounts to import into",
  );
});

function route(params: Record<string, unknown>) {
  const replace = vi.fn();
  const routes = load(`${feature}import-routes.tsx`, {
    "expo-router": {
      useLocalSearchParams: () => params,
      useRouter: () => ({ replace }),
    },
    "./import-batch-screen": { ImportBatchScreen: "batch" },
    "./import-history-screen": { ImportHistoryScreen: "history" },
    "./import-screen": { ImportScreen: "upload" },
    "../accounts/route-id": accountRouteId,
  }) as Record<string, () => unknown>;
  return { routes, replace };
}

it("opens the upload and batch screens only for a well-formed id, otherwise an invalid-link screen", () => {
  const id = "11111111-1111-4111-8111-111111111111";
  const upload = route({ accountId: id.toUpperCase() });
  expect(upload.routes.ImportUploadRoute?.()).toMatchObject({
    type: "upload",
    props: { accountId: id },
  });
  const batch = route({ batchId: id });
  expect(batch.routes.ImportBatchRoute?.()).toMatchObject({
    type: "batch",
    props: { batchId: id },
  });
  for (const bad of [undefined, "", "bad", [id], null]) {
    const invalid = route({ accountId: bad, batchId: bad });
    press(invalid.routes.ImportUploadRoute?.(), "Open imports");
    press(invalid.routes.ImportBatchRoute?.(), "Open imports");
    expect(invalid.replace).toHaveBeenCalledTimes(2);
  }
});

it("wires routes, tab, Home entry and the dependencies", () => {
  const root = "apps/mobile";
  for (const [file, symbol] of [
    ["imports/index.tsx", "ImportAccountsScreen"],
    ["imports/upload/[accountId].tsx", "ImportUploadRoute"],
    ["imports/[batchId]/index.tsx", "ImportBatchRoute"],
  ] as const)
    expect(
      readFileSync(`${root}/app/(workspace)/${file}`, "utf8"),
      file,
    ).toContain(symbol);
  expect(
    readFileSync(`${root}/src/features/home/home-screen.tsx`, "utf8"),
  ).toContain('router.push("/imports")');
  expect(
    JSON.parse(readFileSync(`${root}/package.json`, "utf8")).dependencies,
  ).toHaveProperty(
    "expo-document-picker",
    expect.stringMatching(/^58\.0\.\d+$/),
  );
  void contracts;
});

it("shows detected settings with an edit option and exposes only missing fields for partial suggestions", () => {
  const complete = {
    ...mapping.emptyMapping,
    amountMode: "SIGNED",
    date: "0",
    description: "1",
    amount: "2",
    dateFormat: "ISO",
    decimalSeparator: "DOT",
    positiveIs: "INFLOW",
  };
  const full = importScreen(
    flow({
      file,
      inspection: { ...inspection, suggestedMapping: { date: 0 } },
      mapping: complete,
    }),
  );
  expect(JSON.stringify(expand(full))).toContain("Columns detected");
  expect(JSON.stringify(expand(full))).toContain("Date: Date (ISO)");
  expect(expand(full).some((e) => e.type === "mapping")).toBe(false);
  expect(byLabel(full, "Edit all columns and settings")).toBeDefined();
  const partial = fields(
    { ...complete, positiveIs: "" } as mapping.MappingDraft,
    true,
  ).tree;
  expect(byLabel(partial, "Positive amounts are")).toBeDefined();
  expect(byLabel(partial, "Date column")).toBeUndefined();
  expect(byLabel(partial, "Currency column, optional")).toBeUndefined();
  expect(
    byLabel(
      fields(complete as mapping.MappingDraft).tree,
      "Currency column, optional",
    ),
  ).toBeDefined();
});

it("keeps mapping visible during an authorized refresh while preview stays disabled", () => {
  const state = flow(
    { file, inspection },
    {
      resource: { kind: "loading", refreshing: true },
      allowed: false,
      editable: false,
      localMappingEditable: true,
      preservingDraft: true,
    },
  );
  const content = importScreen(state);
  const mappingControl = expand(content).find(
    (item) => item.type === "mapping",
  );
  expect(mappingControl?.props.disabled).toBe(false);
  expect(byLabel(content, "Start preview")?.disabled).toBe(true);
  expect(
    expand(boundary(state).tree).some((item) => item.props.label === "FORM"),
  ).toBe(true);
  expect(
    expand(boundary(state).tree).some((item) => item.type === "feedback"),
  ).toBe(false);
  state.preservingDraft = false;
  expect(
    expand(boundary(state).tree).some((item) => item.props.label === "FORM"),
  ).toBe(false);
});

it("opens every mapping field for overriding detected choices", () => {
  const h = hookHarness();
  const complete = {
    ...mapping.emptyMapping,
    amountMode: "SIGNED",
    date: "0",
    description: "1",
    amount: "2",
    dateFormat: "ISO",
    decimalSeparator: "DOT",
    positiveIs: "INFLOW",
  };
  const state = flow({
    file,
    inspection: { ...inspection, suggestedMapping: { date: 0 } },
    mapping: complete,
  });
  const render = () => h.render(() => importScreen(state, h.react));
  press(render(), "Edit all columns and settings");
  const control = expand(render()).find((item) => item.type === "mapping");
  expect(control?.props.missingOnly).toBe(false);
  const fieldView = fields(complete as mapping.MappingDraft);
  (byLabel(fieldView.tree, "Date column")?.onChange as (value: string) => void)(
    "2",
  );
  expect(fieldView.onChange).toHaveBeenCalledWith({ ...complete, date: "2" });
});

it("requests an explicit currency column for an ambiguous detected file", () => {
  const complete = {
    ...mapping.emptyMapping,
    amountMode: "SIGNED",
    date: "0",
    description: "1",
    amount: "2",
    dateFormat: "ISO",
    decimalSeparator: "DOT",
    positiveIs: "INFLOW",
  };
  const state = flow({
    file,
    inspection: {
      ...inspection,
      suggestedMapping: { date: 0 },
      requiresCurrencyColumn: true,
    },
    mapping: complete,
  });
  const tree = importScreen(state);
  expect(byLabel(tree, "Start preview")?.disabled).toBe(true);
  const control = expand(tree).find((item) => item.type === "mapping");
  expect(control?.props).toMatchObject({
    requiresCurrencyColumn: true,
    missingOnly: true,
  });
  const choices = (
    load(`${feature}mapping-fields.tsx`, {
      "../accounts/account-choice": { AccountChoice: "choice" },
      "./import-mapping": mapping,
    }).MappingFields as (props: unknown) => unknown
  )({
    value: complete,
    columns: inspection.columns,
    onChange: vi.fn(),
    disabled: false,
    missingOnly: true,
    requiresCurrencyColumn: true,
  });
  expect(byLabel(choices, "Currency column")).toBeDefined();
});
