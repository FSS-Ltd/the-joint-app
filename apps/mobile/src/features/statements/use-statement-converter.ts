import { useState, useCallback, useRef } from "react";
import {
  validateStatementFile,
  parseStatementText,
  reconcileStatementRows,
  convertRowsToCsv,
  extractTextFromPdfBytes,
  type ExtractedStatementRow,
  type PickedStatementFile,
  type StatementReconciliation,
} from "./statement-converter";
import {
  pickStatementPdfFile,
  readLocalStatementBytes,
  discardStatementFile,
} from "./statement-picker";

export interface StatementConverterState {
  status: "idle" | "reading" | "reviewing" | "error";
  errorMessage: string | null;
  file: PickedStatementFile | null;
  rows: ExtractedStatementRow[];
  reconciliation: StatementReconciliation | null;
  pageCount: number;
}

export function useStatementConverter() {
  const [state, setState] = useState<StatementConverterState>({
    status: "idle",
    errorMessage: null,
    file: null,
    rows: [],
    reconciliation: null,
    pageCount: 0,
  });

  const abortControllerRef = useRef<AbortController | null>(null);

  const cancel = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    if (state.file?.uri) {
      discardStatementFile(state.file.uri);
    }
    setState({
      status: "idle",
      errorMessage: null,
      file: null,
      rows: [],
      reconciliation: null,
      pageCount: 0,
    });
  }, [state.file]);

  const reset = useCallback(() => {
    cancel();
  }, [cancel]);

  const pickAndExtract = useCallback(async () => {
    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setState((prev) => ({
      ...prev,
      status: "reading",
      errorMessage: null,
    }));

    let picked: PickedStatementFile | null = null;
    try {
      picked = await pickStatementPdfFile();
      if (!picked || controller.signal.aborted) {
        setState((prev) => ({ ...prev, status: "idle" }));
        return;
      }

      const validationError = validateStatementFile(picked);
      if (validationError) {
        discardStatementFile(picked.uri);
        setState((prev) => ({
          ...prev,
          status: "error",
          errorMessage: validationError,
        }));
        return;
      }

      const bytes = await readLocalStatementBytes(
        picked.uri,
        controller.signal,
      );
      if (controller.signal.aborted) {
        discardStatementFile(picked.uri);
        return;
      }

      const extraction = await extractTextFromPdfBytes(
        bytes,
        controller.signal,
      );
      if (extraction.isEncrypted) {
        discardStatementFile(picked.uri);
        setState((prev) => ({
          ...prev,
          status: "error",
          errorMessage:
            "Password-protected PDFs must be unlocked before conversion.",
        }));
        return;
      }

      const parsed = parseStatementText(extraction.text);
      if (parsed.rows.length === 0) {
        discardStatementFile(picked.uri);
        setState((prev) => ({
          ...prev,
          status: "error",
          errorMessage:
            "We could not find recognized transactions in this statement layout.",
        }));
        return;
      }

      const reconciliation = reconcileStatementRows(
        parsed.rows,
        parsed.summary,
      );

      // Successfully parsed, remove original cached PDF from ephemeral store
      discardStatementFile(picked.uri);

      setState({
        status: "reviewing",
        errorMessage: null,
        file: picked,
        rows: parsed.rows,
        reconciliation,
        pageCount: extraction.pageCount,
      });
    } catch {
      if (picked?.uri) {
        discardStatementFile(picked.uri);
      }
      if (!controller.signal.aborted) {
        setState((prev) => ({
          ...prev,
          status: "error",
          errorMessage:
            "We could not read that statement file. Choose it again.",
        }));
      }
    } finally {
      if (abortControllerRef.current === controller) {
        abortControllerRef.current = null;
      }
    }
  }, []);

  const toggleRowExcluded = useCallback((id: string) => {
    setState((prev) => {
      const updatedRows = prev.rows.map((row) =>
        row.id === id ? { ...row, isExcluded: !row.isExcluded } : row,
      );
      const reconciliation = prev.reconciliation
        ? reconcileStatementRows(updatedRows, {
            openingBalanceMinor: prev.reconciliation.openingBalanceMinor,
            closingBalanceMinor: prev.reconciliation.closingBalanceMinor,
            totalDebitsMinor: prev.reconciliation.totalDebitsMinor,
            totalCreditsMinor: prev.reconciliation.totalCreditsMinor,
          })
        : null;
      return {
        ...prev,
        rows: updatedRows,
        reconciliation,
      };
    });
  }, []);

  const updateRow = useCallback(
    (id: string, updates: Partial<ExtractedStatementRow>) => {
      setState((prev) => {
        const updatedRows = prev.rows.map((row) =>
          row.id === id ? { ...row, ...updates } : row,
        );
        const reconciliation = prev.reconciliation
          ? reconcileStatementRows(updatedRows, {
              openingBalanceMinor: prev.reconciliation.openingBalanceMinor,
              closingBalanceMinor: prev.reconciliation.closingBalanceMinor,
              totalDebitsMinor: prev.reconciliation.totalDebitsMinor,
              totalCreditsMinor: prev.reconciliation.totalCreditsMinor,
            })
          : null;
        return {
          ...prev,
          rows: updatedRows,
          reconciliation,
        };
      });
    },
    [],
  );

  const generateCsvAndHandoff = useCallback(
    (
      onHandoff: (file: {
        name: string;
        bytes: Uint8Array<ArrayBuffer>;
      }) => void,
    ) => {
      const csvContent = convertRowsToCsv(state.rows);
      const bytes = new TextEncoder().encode(csvContent);
      const baseName = (state.file?.name || "statement").replace(/\.pdf$/i, "");
      const csvName = `${baseName}.csv`;

      onHandoff({
        name: csvName,
        bytes: bytes as Uint8Array<ArrayBuffer>,
      });

      // Clear converter state after successful handoff
      setState({
        status: "idle",
        errorMessage: null,
        file: null,
        rows: [],
        reconciliation: null,
        pageCount: 0,
      });
    },
    [state.rows, state.file],
  );

  return {
    state,
    pickAndExtract,
    toggleRowExcluded,
    updateRow,
    generateCsvAndHandoff,
    cancel,
    reset,
  };
}
