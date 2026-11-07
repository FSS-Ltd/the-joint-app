import { useEffect, useRef, useState } from "react";
import type { ImportBatchResponse } from "@joint/contracts";
import { useNativeFinance } from "../finance/context";
import { financeErrorMessage } from "../finance/errors";

export const historyPage = 20;
export type HistoryState =
  | { kind: "loading" }
  | {
      kind: "ready";
      items: ImportBatchResponse[];
      cursor: string | null;
    }
  | { kind: "error"; message: string };

/**
 * An account's import batches, newest first: one fenced first page, then an explicit
 * "load more". Reads are aborted on authority change or unmount and never polled.
 */
export function useImportHistory(accountId: string): {
  state: HistoryState;
  loadMore(): void;
  moreLoading: boolean;
  /** A failed "load more" keeps the loaded list and shows its error beside the button. */
  moreError: string;
  retry(): void;
} {
  const finance = useNativeFinance();
  const authority = finance.authority;
  const [state, setState] = useState<HistoryState>({ kind: "loading" });
  const [moreLoading, setMoreLoading] = useState(false);
  const [moreError, setMoreError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const more = useRef<AbortController | null>(null);
  useEffect(() => {
    if (!authority) {
      // No authority: drop whatever the previous household's list held.
      setMoreLoading(false);
      setMoreError("");
      setState({ kind: "loading" });
      return;
    }
    const controller = new AbortController();
    setMoreLoading(false);
    setMoreError("");
    setState({ kind: "loading" });
    void finance.imports
      .list(
        authority.householdId,
        { accountId, limit: historyPage },
        controller.signal,
      )
      .then((page) => {
        if (!controller.signal.aborted)
          setState({
            kind: "ready",
            items: page.items,
            cursor: page.nextCursor,
          });
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted)
          setState({ kind: "error", message: financeErrorMessage(error) });
      });
    return () => {
      controller.abort();
      more.current?.abort();
    };
  }, [authority, finance, accountId, attempt]);
  // A late page must never publish after the screen is gone.
  useEffect(() => () => more.current?.abort(), []);
  function loadMore() {
    if (!authority || state.kind !== "ready" || !state.cursor) return;
    const { cursor, items } = state;
    more.current?.abort();
    const controller = new AbortController();
    more.current = controller;
    setMoreLoading(true);
    setMoreError("");
    void finance.imports
      .list(
        authority.householdId,
        { accountId, limit: historyPage, cursor },
        controller.signal,
      )
      .then((page) => {
        if (!controller.signal.aborted)
          setState({
            kind: "ready",
            items: [...items, ...page.items],
            cursor: page.nextCursor,
          });
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted)
          setMoreError(financeErrorMessage(error));
      })
      .finally(() => {
        if (more.current === controller) {
          more.current = null;
          setMoreLoading(false);
        }
      });
  }
  return {
    state,
    loadMore,
    moreLoading,
    moreError,
    retry: () => setAttempt((value) => value + 1),
  };
}
