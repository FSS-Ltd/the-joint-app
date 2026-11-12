import { useLayoutEffect, useRef, useState } from "react";
import { randomUUID } from "expo-crypto";
import type {
  AccountResponse,
  CsvColumn,
  CsvMappingSuggestion,
  ImportBatchResponse,
  ValuationInput,
} from "@joint/contracts";
import { useNativeFinance } from "../finance/context";
import { financeErrorMessage } from "../finance/errors";
import type { FinanceMutationResult } from "../finance/state";
import { useFinanceMutation } from "../finance/use-mutation";
import { useFinanceResource } from "../finance/use-resource";
import { useWriteDraft } from "../accounts/use-write-draft";
import {
  statementIsEligible,
  useOpeningBalance,
  type ImportAccount,
} from "./use-opening-balance";
import type { WriteDraft } from "../accounts/write-state";
import { readCsvBytes } from "./import-file";
import { previewIntent } from "./import-intent";
import {
  emptyMapping,
  mappingInput,
  suggestedDraft,
  type MappingDraft,
} from "./import-mapping";
import { discardLocalFile, pickCsvFile, readLocalFile } from "./import-picker";

/** Held only for this attempt; the draft store drops it on background, blur and authority loss. */
export interface ImportDraft {
  file: { name: string; bytes: Uint8Array<ArrayBuffer> } | null;
  inspection: {
    columns: CsvColumn[];
    rowCount: number;
    suggestedMapping?: CsvMappingSuggestion;
    requiresCurrencyColumn?: boolean;
    statementBalance?: { money: ValuationInput["money"]; asOfDate: string };
  } | null;
  mapping: MappingDraft;
}
export const emptyImportDraft = (): ImportDraft => ({
  file: null,
  inspection: null,
  mapping: emptyMapping,
});
export interface ImportFlow {
  account: AccountResponse | null;
  draft: WriteDraft<ImportDraft, ImportAccount>;
  mutation: FinanceMutationResult<ImportBatchResponse>;
  openingMutation: FinanceMutationResult<AccountResponse>;
  needsOpening: boolean;
  statementAvailable: boolean;
  saveOpening(amount: string, date: string): Promise<void>;
  correctOpening(): void;
  saveStatementBalance(input: ValuationInput): Promise<void>;
  resource: ReturnType<typeof useFinanceResource<ImportAccount>>;
  allowed: boolean;
  editable: boolean;
  localMappingEditable: boolean;
  preservingDraft: boolean;
  /** After a rejected upload: keep the file and mapping and allow another attempt. */
  editAgain(): void;
  busy: "reading" | "inspecting" | null;
  chooseFile(): Promise<void>;
  loadGeneratedCsv(file: {
    name: string;
    bytes: Uint8Array<ArrayBuffer>;
  }): void;
  inspect(): Promise<void>;
  changeMapping(mapping: MappingDraft): void;
  submit(): Promise<void>;
  reload(): void;
}
const owner = (account: AccountResponse) => account.ownership === "OWNED";

/** Pick, inspect, map and preview one CSV for an owned account; nothing here commits. */
export function useImportFlow(accountId: string): ImportFlow {
  const finance = useNativeFinance();
  const resource = useFinanceResource(
    {
      kind: "account",
      householdId:
        finance.authority?.householdId ??
        "00000000-0000-4000-8000-000000000000",
      id: accountId,
    },
    async (scope, signal) => {
      const account = await finance.accounts.read(
        scope.householdId,
        accountId,
        signal,
      );
      const result = await finance.accounts.currentBalances(
        scope.householdId,
        [accountId],
        signal,
      );
      const balance = result.items[0];
      if (!balance) throw new Error("Missing requested balance");
      return { ...account, csvBalance: balance };
    },
    { preserveRefreshHint: true },
  );
  const draft = useWriteDraft<ImportDraft, ImportAccount>(
    `import:${accountId}`,
    emptyImportDraft,
  );
  const mutation = useFinanceMutation<ImportBatchResponse>(
    `import:${accountId}`,
  );
  const previewIssued = useRef(false);
  const [busy, setBusy] = useState<ImportFlow["busy"]>(null);
  const work = useRef<AbortController | null>(null);
  const latest = useRef(draft.value);
  latest.current = draft.value;
  const opening = useOpeningBalance({
    accountId,
    resource,
    active: draft.visible && !draft.invalidated && draft.base !== null,
    canStart: () =>
      mutation.kind === "idle" &&
      !previewIssued.current &&
      !work.current &&
      latest.current.inspection !== null,
    statement: () => latest.current.inspection?.statementBalance,
    error: draft.error,
  });
  const revoked = useRef(false);
  revoked.current = draft.invalidated;
  const live = useRef(false);
  live.current = draft.visible && draft.base !== null && !draft.invalidated;
  const account = resource.kind === "ready" ? resource.value : null;
  const allowed = account !== null && owner(account);
  useLayoutEffect(() => {
    if (!account) return;
    if (!owner(account)) {
      draft.invalidate();
      mutation.reset();
      opening.reset();
    } else draft.initialize(account, emptyImportDraft());
  }, [
    account,
    draft.initialize,
    draft.invalidate,
    mutation.reset,
    opening.reset,
  ]);
  useLayoutEffect(() => {
    if (!draft.visible || draft.invalidated) {
      previewIssued.current = false;
    }
  }, [draft.visible, draft.invalidated]);
  // The upload is accepted: release the file bytes immediately.
  useLayoutEffect(() => {
    if (mutation.kind === "success") draft.change(emptyImportDraft());
  }, [mutation.kind, draft.change]);
  // A superseded or abandoned read must never publish late.
  useLayoutEffect(() => () => work.current?.abort(), []);
  // The system picker can background the app (Android), which clears the draft; the
  // chosen file waits here, in memory only, until the draft is live again.
  const pending = useRef<ImportDraft["file"]>(null);
  useLayoutEffect(() => {
    const file = pending.current;
    if (!file) return;
    if (draft.invalidated) {
      pending.current = null;
      return;
    }
    if (!draft.visible || !draft.base) return;
    pending.current = null;
    draft.change({ file, inspection: null, mapping: emptyMapping });
  }, [draft.visible, draft.base, draft.invalidated]);
  useLayoutEffect(
    () => () => {
      pending.current = null;
    },
    [],
  );
  const preservingDraft =
    resource.kind === "loading" &&
    "refreshing" in resource &&
    resource.refreshing === true &&
    draft.visible &&
    !draft.invalidated &&
    draft.base !== null &&
    owner(draft.base);
  const localMappingEditable =
    (allowed || preservingDraft) &&
    draft.visible &&
    !draft.invalidated &&
    draft.base !== null &&
    mutation.kind === "idle" &&
    busy === null;
  const localEdit = useRef(false);
  localEdit.current = localMappingEditable;
  const openingAccount = account ?? (preservingDraft ? draft.base : null);
  const needsOpening =
    !!openingAccount &&
    (openingAccount.kind === "CURRENT" || openingAccount.kind === "SAVINGS") &&
    openingAccount.csvBalance.status === "MISSING_ANCHOR";
  const hint = draft.value.inspection?.statementBalance;
  const statementAvailable =
    !!openingAccount &&
    !!hint &&
    (openingAccount.kind === "CURRENT" || openingAccount.kind === "SAVINGS") &&
    statementIsEligible(openingAccount.csvBalance, hint.asOfDate);
  const editable =
    draft.visible &&
    !draft.invalidated &&
    allowed &&
    draft.base !== null &&
    mutation.kind === "idle" &&
    opening.mutation.kind === "idle" &&
    busy === null;

  function begin(kind: NonNullable<ImportFlow["busy"]>): AbortController {
    work.current?.abort();
    const controller = new AbortController();
    work.current = controller;
    setBusy(kind);
    return controller;
  }
  function end(controller: AbortController) {
    if (work.current === controller) {
      work.current = null;
      setBusy(null);
    }
  }
  async function chooseFile(): Promise<void> {
    // A second tap before the next render must not open a second picker.
    if (
      !editable ||
      opening.issued.current ||
      previewIssued.current ||
      work.current
    )
      return;
    const controller = begin("reading");
    let picked: Awaited<ReturnType<typeof pickCsvFile>> = null;
    try {
      picked = await pickCsvFile();
      if (!picked || controller.signal.aborted) return;
      const read = await readCsvBytes(picked, controller.signal, readLocalFile);
      if (controller.signal.aborted) return;
      if (!read.ok) draft.error(read.message);
      else {
        const file = { name: picked.name, bytes: read.value };
        if (live.current)
          draft.change({ file, inspection: null, mapping: emptyMapping });
        // Never park bytes for a draft that has already lost access.
        else if (!revoked.current) pending.current = file;
      }
    } catch {
      if (!controller.signal.aborted)
        draft.error("We could not read that file. Choose it again.");
    } finally {
      // The cached copy is a plaintext statement; it never outlives the read.
      if (picked) discardLocalFile(picked.uri);
      end(controller);
    }
  }
  function loadGeneratedCsv(file: {
    name: string;
    bytes: Uint8Array<ArrayBuffer>;
  }): void {
    if (!editable || opening.issued.current || previewIssued.current) return;
    if (live.current) {
      draft.change({ file, inspection: null, mapping: emptyMapping });
    } else if (!revoked.current) {
      pending.current = file;
    }
  }
  async function inspect(): Promise<void> {
    const authority = finance.authority;
    const file = latest.current.file;
    const current = resource.current();
    if (
      !editable ||
      opening.issued.current ||
      previewIssued.current ||
      !file ||
      !authority ||
      !current ||
      !owner(current) ||
      work.current
    )
      return;
    const controller = begin("inspecting");
    try {
      const result = await finance.imports.inspect(
        authority.householdId,
        accountId,
        file.bytes,
        controller.signal,
      );
      if (
        controller.signal.aborted ||
        !finance.isCurrent(authority) ||
        !resource.current() ||
        latest.current.file !== file
      )
        return;
      draft.change({
        ...latest.current,
        inspection: result,
        mapping: result.suggestedMapping
          ? suggestedDraft(result.suggestedMapping)
          : emptyMapping,
      });
    } catch (error) {
      if (!controller.signal.aborted) draft.error(financeErrorMessage(error));
    } finally {
      end(controller);
    }
  }
  function changeMapping(mapping: MappingDraft) {
    if (
      !localEdit.current ||
      !finance.authority ||
      !finance.isCurrent(finance.authority)
    )
      return;
    draft.change({ ...latest.current, mapping });
  }
  async function submit(): Promise<void> {
    const current = resource.kind === "ready" ? resource.current() : null;
    const { file, inspection, mapping } = latest.current;
    if (
      !editable ||
      opening.issued.current ||
      previewIssued.current ||
      !draft.base ||
      !current ||
      !owner(current)
    )
      return;
    if (
      (current.kind === "CURRENT" || current.kind === "SAVINGS") &&
      current.csvBalance.status === "MISSING_ANCHOR"
    ) {
      draft.error("Record an opening or statement balance before preview.");
      return;
    }
    if (!file || !inspection) {
      draft.error("Choose a file and check it first.");
      return;
    }
    if (inspection.requiresCurrencyColumn && !mapping.currency) {
      draft.error("Choose the currency column before preview.");
      return;
    }
    const parsed = mappingInput(mapping, inspection.columns.length);
    if (!parsed.ok) {
      draft.error(parsed.message);
      return;
    }
    try {
      const intent = previewIntent(
        finance,
        current,
        file.bytes,
        parsed.value,
        randomUUID(),
      );
      previewIssued.current = true;
      await mutation.submit(intent);
    } catch (error) {
      draft.error(financeErrorMessage(error));
    }
  }
  async function retry(): Promise<void> {
    const current = resource.current();
    if (
      !live.current ||
      !finance.authority ||
      !finance.isCurrent(finance.authority) ||
      !current ||
      !owner(current)
    )
      return;
    await mutation.retry();
  }
  function editAgain() {
    // Only a rejected upload may be edited; an uncertain one must replay unchanged.
    if (mutation.kind === "error") {
      previewIssued.current = false;
      mutation.reset();
    }
  }
  function reload() {
    work.current?.abort();
    // Release the busy state now; an abandoned picker must not keep the buttons disabled.
    work.current = null;
    setBusy(null);
    pending.current = null;
    mutation.reset();
    opening.reset();
    previewIssued.current = false;
    draft.clear();
    resource.retry();
  }
  return {
    account,
    draft,
    mutation: { ...mutation, retry },
    openingMutation: opening.mutation,
    needsOpening,
    statementAvailable,
    saveOpening: opening.saveOpening,
    correctOpening: opening.correct,
    saveStatementBalance: opening.saveStatementBalance,
    resource,
    allowed,
    editable,
    localMappingEditable,
    preservingDraft,
    editAgain,
    busy,
    chooseFile,
    loadGeneratedCsv,
    inspect,
    changeMapping,
    submit,
    reload,
  };
}
