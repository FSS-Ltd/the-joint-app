import { useEffect, useState } from "react";
import {
  useNativeFinance,
  type NativeFinanceContextValue,
} from "../finance/context";
import { financeErrorMessage } from "../finance/errors";

export type FencedReadState<T> =
  | { kind: "loading" }
  | { kind: "ready"; value: T }
  | { kind: "error"; message: string };

/**
 * One read per authority, aborted on authority change or unmount; no polling and
 * no implicit retry. `load` must be a stable module-level function.
 */
export function useFencedRead<T>(
  id: string,
  load: (
    finance: NativeFinanceContextValue,
    householdId: string,
    id: string,
    signal: AbortSignal,
  ) => Promise<T>,
): { state: FencedReadState<T>; reload(): void } {
  const finance = useNativeFinance();
  const authority = finance.authority;
  const [state, setState] = useState<FencedReadState<T>>({ kind: "loading" });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!authority) return;
    const controller = new AbortController();
    setState({ kind: "loading" });
    void load(finance, authority.householdId, id, controller.signal)
      .then((value) => {
        if (!controller.signal.aborted) setState({ kind: "ready", value });
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted)
          setState({ kind: "error", message: financeErrorMessage(error) });
      });
    return () => controller.abort();
  }, [authority, finance, id, load, attempt]);
  return { state, reload: () => setAttempt((value) => value + 1) };
}
