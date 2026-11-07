import { useEffect, useState } from "react";
import type { NormalizedCsvRow } from "@joint/contracts";
import { useNativeFinance } from "../finance/context";
import { financeErrorMessage } from "../finance/errors";

/** Small pages keep the number of native pickers on screen low; the server allows up to 100. */
export const importRowsPage = 25;
export type RowsFilter = "ALL" | "REVIEW" | "REJECTED";
export type RowsState =
  | { kind: "loading" }
  | { kind: "ready"; items: NormalizedCsvRow[]; nextOffset: number | null }
  | { kind: "error"; message: string };

/**
 * One explicit page of source rows, re-read only when the page, filter or `refresh`
 * key changes; aborted on authority change. Never polled.
 */
export function useImportRows(
  batchId: string,
  filter: RowsFilter,
  offset: number,
  refresh: unknown,
  enabled = true,
): { state: RowsState; retry(): void } {
  const finance = useNativeFinance();
  const authority = finance.authority;
  const [state, setState] = useState<RowsState>({ kind: "loading" });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!authority || !enabled) {
      // A closed gate drops any rows held for the previous one.
      setState({ kind: "loading" });
      return;
    }
    const controller = new AbortController();
    setState({ kind: "loading" });
    void finance.imports
      .rows(
        authority.householdId,
        batchId,
        { offset, limit: importRowsPage, filter },
        controller.signal,
      )
      .then((page) => {
        if (!controller.signal.aborted)
          setState({
            kind: "ready",
            items: page.items,
            nextOffset: page.nextOffset,
          });
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted)
          setState({ kind: "error", message: financeErrorMessage(error) });
      });
    return () => controller.abort();
  }, [authority, finance, batchId, filter, offset, refresh, enabled, attempt]);
  return { state, retry: () => setAttempt((value) => value + 1) };
}
