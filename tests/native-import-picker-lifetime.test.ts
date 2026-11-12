import { afterEach, beforeEach, expect, it, vi } from "vitest";
import * as contracts from "../packages/contracts/src/index.js";
import * as errors from "../apps/mobile/src/features/finance/errors.js";
import { effectHarness } from "./fixtures/native-effect-harness.js";
import { account } from "./fixtures/native-read-ui.js";
import { sourceExports } from "./fixtures/native-source-harness.js";
import { deferred } from "./fixtures/native-stream.js";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

/** Local shape: importing the hook module would leak React Native globals into the root test project. */
interface Flow {
  chooseFile(): Promise<void>;
  reload(): void;
}
const itemAccount = account({
  householdId: "00000000-0000-4000-8000-000000000001",
});
const item = {
  ...itemAccount,
  csvBalance: { accountId: itemAccount.id, status: "MISSING_ANCHOR" as const },
};
const picked = {
  name: "statement.csv",
  uri: "file:///cache/statement.csv",
  size: 20,
};

function setup() {
  const h = effectHarness();
  const draftState = {
    visible: true,
    base: item as typeof item | null,
    invalidated: false,
    value: { file: null, inspection: null, mapping: {} },
  };
  const change = vi.fn();
  const pick = deferred<typeof picked>();
  const hook = sourceExports(
    "apps/mobile/src/features/imports/use-import-flow.ts",
    {
      react: h.react,
      "expo-crypto": { randomUUID: () => "k" },
      "../finance/context": {
        useNativeFinance: () => ({
          authority: { householdId: item.householdId },
          imports: {},
          isCurrent: () => true,
        }),
      },
      "../finance/errors": errors,
      "./use-opening-balance": {
        statementIsEligible: () => false,
        useOpeningBalance: () => ({
          mutation: { kind: "idle" },
          issued: { current: false },
          reset: vi.fn(),
        }),
      },
      "../finance/use-mutation": {
        useFinanceMutation: () => ({
          kind: "idle",
          reset: vi.fn(),
          submit: vi.fn(),
        }),
      },
      "../finance/use-resource": {
        useFinanceResource: () => ({
          kind: "ready",
          value: item,
          current: () => item,
          retry: vi.fn(),
        }),
      },
      "../accounts/use-write-draft": {
        useWriteDraft: () => ({
          ...draftState,
          change,
          error: vi.fn(),
          clear: vi.fn(),
          initialize: vi.fn(),
          invalidate: vi.fn(),
        }),
      },
      "./import-file": sourceExports(
        "apps/mobile/src/features/imports/import-file.ts",
        { "@joint/contracts": contracts },
      ),
      "./import-intent": {},
      "./import-mapping": sourceExports(
        "apps/mobile/src/features/imports/import-mapping.ts",
        { "@joint/contracts": contracts },
      ),
      "./import-picker": {
        pickCsvFile: () => pick.promise,
        readLocalFile: async () =>
          new TextEncoder().encode("a,b\n1,2\n").buffer,
        discardLocalFile: vi.fn(),
      },
    },
  ).useImportFlow as (id: string) => Flow;
  const render = () => h.render(() => hook(item.id));
  return { h, draftState, change, pick, render };
}

it("waits for the draft to be live again before storing a file read while it was cleared", async () => {
  const s = setup();
  s.render();
  const reading = s.render().chooseFile();
  // The system picker backgrounded the app and the draft was cleared.
  s.draftState.visible = false;
  s.draftState.base = null;
  s.render();
  s.pick.resolve(picked);
  await reading;
  expect(s.change).not.toHaveBeenCalled();
  // A base without a visible draft (still backgrounded) must not receive the file.
  s.draftState.base = item;
  s.render();
  expect(s.change).not.toHaveBeenCalled();
  // Foreground: the account is re-read and the draft re-seeded.
  s.draftState.visible = true;
  s.render();
  expect(s.change).toHaveBeenCalledOnce();
  expect(s.change.mock.calls[0]?.[0]).toMatchObject({
    file: { name: "statement.csv" },
    inspection: null,
  });
  s.render();
  expect(s.change).toHaveBeenCalledOnce();
  s.h.unmount();
});

it("stores the file at once when the draft stayed live", async () => {
  const s = setup();
  const reading = s.render().chooseFile();
  s.pick.resolve(picked);
  await reading;
  expect(s.change).toHaveBeenCalledOnce();
  s.h.unmount();
});

it("drops a waiting file when access is lost or the flow is reloaded", async () => {
  const lost = setup();
  const reading = lost.render().chooseFile();
  lost.draftState.visible = false;
  lost.draftState.base = null;
  lost.render();
  lost.pick.resolve(picked);
  await reading;
  lost.draftState.invalidated = true;
  lost.render();
  lost.draftState.invalidated = false;
  lost.draftState.visible = true;
  lost.draftState.base = item;
  lost.render();
  expect(lost.change).not.toHaveBeenCalled();
  lost.h.unmount();

  const reloaded = setup();
  const second = reloaded.render().chooseFile();
  reloaded.draftState.visible = false;
  reloaded.draftState.base = null;
  reloaded.render();
  reloaded.pick.resolve(picked);
  await second;
  reloaded.render().reload();
  reloaded.draftState.visible = true;
  reloaded.draftState.base = item;
  reloaded.render();
  expect(reloaded.change).not.toHaveBeenCalled();
  reloaded.h.unmount();
});

it("frees the busy state on reload even if the picker never settles", async () => {
  const s = setup();
  const view = s.render();
  void view.chooseFile();
  s.render().reload();
  const again = s.render().chooseFile();
  s.pick.resolve(picked);
  await again;
  expect(s.change).toHaveBeenCalledOnce();
  s.h.unmount();
});

it("never parks a file read after access was already revoked", async () => {
  const s = setup();
  const reading = s.render().chooseFile();
  s.draftState.invalidated = true;
  s.draftState.visible = false;
  s.draftState.base = null;
  s.render();
  s.pick.resolve(picked);
  await reading;
  // Even if the draft later looks live again, nothing was kept to deliver.
  s.draftState.invalidated = false;
  s.draftState.visible = true;
  s.draftState.base = item;
  s.render();
  expect(s.change).not.toHaveBeenCalled();
  s.h.unmount();
});
