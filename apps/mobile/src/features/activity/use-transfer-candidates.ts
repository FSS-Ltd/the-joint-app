import { useEffect, useRef, useState } from "react";
import type { AccountResponse, TransactionResponse } from "@joint/contracts";
import { useNativeFinance } from "../finance/context";
import { financeErrorMessage } from "../finance/errors";
import { isTransferCandidate } from "./transfer-input";

type Load<T> =
  | { kind: "loading" }
  | { kind: "ready"; items: T[]; cursor: string | null }
  | { kind: "error"; message: string };

/**
 * Explicit, fenced reads only: the owner's other accounts once, then one page of
 * the chosen account at a time. Nothing refreshes in the background.
 */
export function useTransferCandidates(base: TransactionResponse | null): {
  accounts: Load<AccountResponse>;
  accountId: string;
  choose(accountId: string): void;
  entries: Load<TransactionResponse>;
  loadMore(): void;
  moreLoading: boolean;
  retry(): void;
  retryEntries(): void;
} {
  const finance = useNativeFinance();
  const authority = finance.authority;
  const [accounts, setAccounts] = useState<Load<AccountResponse>>({
    kind: "loading",
  });
  const [accountId, setAccountId] = useState("");
  const [entries, setEntries] = useState<Load<TransactionResponse>>({
    kind: "loading",
  });
  const [moreLoading, setMoreLoading] = useState(false);
  const [accountsAttempt, setAccountsAttempt] = useState(0);
  const [entriesAttempt, setEntriesAttempt] = useState(0);
  const more = useRef<AbortController | null>(null);
  const baseId = base?.id ?? null;
  const baseAccount = base?.accountId ?? null;
  useEffect(() => {
    if (!authority || !baseId) return;
    const controller = new AbortController();
    setAccounts({ kind: "loading" });
    void finance.accounts
      .list(authority.householdId, { limit: 50 }, controller.signal)
      .then((page) => {
        if (!controller.signal.aborted)
          setAccounts({
            kind: "ready",
            items: page.items.filter(
              (item) => item.ownership === "OWNED" && item.id !== baseAccount,
            ),
            cursor: page.nextCursor,
          });
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted)
          setAccounts({ kind: "error", message: financeErrorMessage(error) });
      });
    return () => controller.abort();
  }, [authority, finance, baseId, baseAccount, accountsAttempt]);
  useEffect(() => {
    if (!authority || !base || !accountId) return;
    const controller = new AbortController();
    setMoreLoading(false);
    setEntries({ kind: "loading" });
    void finance.transactions
      .list(authority.householdId, { accountId, limit: 50 }, controller.signal)
      .then((page) => {
        if (!controller.signal.aborted)
          setEntries({
            kind: "ready",
            items: page.items.filter((item) => isTransferCandidate(base, item)),
            cursor: page.nextCursor,
          });
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted)
          setEntries({ kind: "error", message: financeErrorMessage(error) });
      });
    return () => {
      controller.abort();
      more.current?.abort();
    };
    // The open row is re-read only through an explicit reload, which changes `base`.
  }, [authority, finance, accountId, base, entriesAttempt]);
  // Late pages must never publish after the screen or authority is gone.
  useEffect(() => () => more.current?.abort(), []);
  function loadMore() {
    if (!authority || !base || entries.kind !== "ready" || !entries.cursor)
      return;
    const { cursor } = entries;
    const known = entries.items;
    more.current?.abort();
    const controller = new AbortController();
    more.current = controller;
    setMoreLoading(true);
    void finance.transactions
      .list(
        authority.householdId,
        { accountId, limit: 50, cursor },
        controller.signal,
      )
      .then((page) => {
        if (controller.signal.aborted) return;
        setEntries({
          kind: "ready",
          items: [
            ...known,
            ...page.items.filter((item) => isTransferCandidate(base, item)),
          ],
          cursor: page.nextCursor,
        });
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted)
          setEntries({ kind: "error", message: financeErrorMessage(error) });
      })
      .finally(() => {
        // An aborted request is superseded; only a newer one keeps the flag set.
        if (more.current === controller) {
          more.current = null;
          setMoreLoading(false);
        }
      });
  }
  return {
    accounts,
    accountId,
    choose: setAccountId,
    entries,
    loadMore,
    moreLoading,
    retry: () => setAccountsAttempt((value) => value + 1),
    retryEntries: () => setEntriesAttempt((value) => value + 1),
  };
}
