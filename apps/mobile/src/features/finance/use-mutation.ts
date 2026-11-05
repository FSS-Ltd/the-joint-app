import { useMemo, useSyncExternalStore } from "react";
import { useNativeFinance } from "./context";
import {
  financeErrorMessage,
  financeRecovery,
  NativeApiError,
  needsFinanceReconciliation,
} from "./errors";
import type { FinanceMutationSnapshot, FinanceMutationResult } from "./state";
import { useFinanceLifetime } from "./use-lifetime";

const idle = { kind: "idle" } as const;
export function useFinanceMutation<T>(
  targetKey: string,
): FinanceMutationResult<T> {
  const finance = useNativeFinance();
  const store = useMemo(() => {
    const authority = finance.authority;
    let active = false;
    let epoch = 0;
    let abort: AbortController | undefined;
    let operation: ((signal: AbortSignal) => Promise<T>) | undefined;
    let snapshot: FinanceMutationSnapshot<T> = idle;
    const listeners = new Set<() => void>();
    const current = () =>
      active && authority !== null && finance.isCurrent(authority);
    const publish = (value: FinanceMutationSnapshot<T>) => {
      snapshot = value;
      listeners.forEach((listener) => listener());
    };
    const reset = () => {
      epoch++;
      abort?.abort();
      abort = undefined;
      operation = undefined;
      publish(idle);
    };
    async function run(): Promise<void> {
      if (!current() || !operation || snapshot.kind === "pending") return;
      const attempt = ++epoch;
      const controller = new AbortController();
      abort = controller;
      publish({ kind: "pending" });
      try {
        const value = await operation(controller.signal);
        if (current() && epoch === attempt && !controller.signal.aborted) {
          operation = undefined;
          publish({ kind: "success", value });
        }
      } catch (error) {
        if (!current() || epoch !== attempt || controller.signal.aborted)
          return;
        publish({
          kind:
            error instanceof NativeApiError && error.outcome === "uncertain"
              ? "uncertain"
              : "error",
          message: financeErrorMessage(error),
          recovery: financeRecovery(error),
        });
        if (
          error instanceof NativeApiError &&
          error.status === 401 &&
          authority
        )
          finance.identity.revoke(authority.actor);
        else if (authority && needsFinanceReconciliation(error))
          await finance.reconcile(authority);
      } finally {
        if (abort === controller) abort = undefined;
      }
    }
    return {
      getSnapshot: () => snapshot,
      subscribe(listener: () => void) {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
      start() {
        active = true;
      },
      stop() {
        active = false;
        reset();
      },
      submit(execute: (signal: AbortSignal) => Promise<T>) {
        if (
          !current() ||
          snapshot.kind === "pending" ||
          snapshot.kind === "uncertain"
        )
          return Promise.resolve();
        operation = execute;
        return run();
      },
      async retry() {
        if (snapshot.kind === "error" || snapshot.kind === "uncertain")
          await run();
      },
      reset,
    };
  }, [finance, targetKey]);
  const visible = useFinanceLifetime(finance, finance.authority, store);
  const snapshot = useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    store.getSnapshot,
  );
  return {
    ...(visible ? snapshot : idle),
    submit: store.submit,
    retry: store.retry,
    reset: store.reset,
  };
}
