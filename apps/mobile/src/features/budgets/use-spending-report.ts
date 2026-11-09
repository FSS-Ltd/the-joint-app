import { useMemo, useSyncExternalStore } from "react";
import type { SpendingReport } from "@joint/contracts";
import { useNativeFinance } from "../finance/context";
import {
  NativeApiError,
  financeErrorMessage,
  needsFinanceReconciliation,
} from "../finance/errors";
import { financeAuthorityKey } from "../finance/scope";
import { useFinanceLifetime } from "../finance/use-lifetime";

export type SpendingReportSnapshot =
  | { kind: "loading" }
  | { kind: "ready"; value: SpendingReport }
  | { kind: "error"; message: string };

export type SpendingReportResult = SpendingReportSnapshot & {
  visible: boolean;
  reload(): void;
};

const loading: SpendingReportSnapshot = { kind: "loading" };

export function useSpendingReport(month: string): SpendingReportResult {
  const finance = useNativeFinance();
  const authority = finance.authority;
  const authorityKey = authority ? financeAuthorityKey(authority) : "";

  const store = useMemo(() => {
    let snapshot: SpendingReportSnapshot = loading;
    let controller: AbortController | null = null;
    let active = false;
    const listeners = new Set<() => void>();

    const publish = (next: SpendingReportSnapshot) => {
      snapshot = next;
      listeners.forEach((listener) => listener());
    };

    const current = () =>
      active && authority !== null && finance.isCurrent(authority);

    const load = () => {
      if (!current() || !authority) return;
      controller?.abort();
      const nextController = new AbortController();
      controller = nextController;
      publish(loading);
      void finance.spending
        .readReport(
          authority.householdId,
          month,
          undefined,
          nextController.signal,
        )
        .then((report) => {
          if (!nextController.signal.aborted && current()) {
            publish({ kind: "ready", value: report });
          }
        })
        .catch((error: unknown) => {
          if (nextController.signal.aborted || !current() || !authority) return;
          if (error instanceof NativeApiError && error.status === 401) {
            finance.identity.revoke(authority.actor);
            return;
          }
          publish({ kind: "error", message: financeErrorMessage(error) });
          if (needsFinanceReconciliation(error)) {
            void finance.reconcile(authority);
          }
        });
    };

    return {
      getSnapshot: () => snapshot,
      subscribe(listener: () => void) {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
      start() {
        if (active || !authority || !finance.isCurrent(authority)) return;
        active = true;
        load();
      },
      stop() {
        active = false;
        controller?.abort();
        controller = null;
        publish(loading);
      },
      reload() {
        if (current()) load();
      },
    };
  }, [finance, authority, authorityKey, month]);

  const visible = useFinanceLifetime(finance, authority, store);
  const snapshot = useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    store.getSnapshot,
  );

  return {
    ...(visible ? snapshot : loading),
    visible,
    reload: store.reload,
  };
}
