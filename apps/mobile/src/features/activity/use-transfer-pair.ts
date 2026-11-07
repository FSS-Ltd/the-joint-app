import { useEffect, useState } from "react";
import { useNativeFinance } from "../finance/context";
import { financeErrorMessage } from "../finance/errors";
import type { TransferPair } from "./transfer-input";

export type TransferPairState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "ready"; value: TransferPair }
  | { kind: "error"; message: string };

/** One fenced read of a confirmed pair; no polling and no implicit retry. */
/** `refresh` is any value whose identity changes when the open row is re-read. */
export function useTransferPair(
  transferId: string | null,
  refresh?: unknown,
): {
  state: TransferPairState;
  reload(): void;
} {
  const finance = useNativeFinance();
  const authority = finance.authority;
  const [state, setState] = useState<TransferPairState>({ kind: "idle" });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!authority || !transferId) {
      setState({ kind: "idle" });
      return;
    }
    const controller = new AbortController();
    setState({ kind: "loading" });
    void finance.transactions
      .readTransfer(authority.householdId, transferId, controller.signal)
      .then((value) => {
        if (!controller.signal.aborted) setState({ kind: "ready", value });
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted)
          setState({ kind: "error", message: financeErrorMessage(error) });
      });
    return () => controller.abort();
  }, [authority, finance, transferId, refresh, attempt]);
  return { state, reload: () => setAttempt((value) => value + 1) };
}
