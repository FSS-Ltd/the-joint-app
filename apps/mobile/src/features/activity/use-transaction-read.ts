import { useEffect, useState } from "react";
import type { TransactionResponse } from "@joint/contracts";
import { useNativeFinance } from "../finance/context";
import { financeErrorMessage } from "../finance/errors";

export type TransactionReadState =
  | { kind: "loading" }
  | { kind: "ready"; value: TransactionResponse }
  | { kind: "error"; message: string };

/** One fenced read per authority; no polling and no implicit retry. */
export function useTransactionRead(transactionId: string): {
  state: TransactionReadState;
  reload(): void;
} {
  const finance = useNativeFinance();
  const authority = finance.authority;
  const [state, setState] = useState<TransactionReadState>({ kind: "loading" });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!authority) return;
    const controller = new AbortController();
    setState({ kind: "loading" });
    void finance.transactions
      .read(authority.householdId, transactionId, controller.signal)
      .then((value) => {
        if (!controller.signal.aborted) setState({ kind: "ready", value });
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted)
          setState({ kind: "error", message: financeErrorMessage(error) });
      });
    return () => controller.abort();
  }, [authority, finance, transactionId, attempt]);
  return { state, reload: () => setAttempt((value) => value + 1) };
}
