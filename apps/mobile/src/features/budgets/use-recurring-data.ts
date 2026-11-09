import { useMemo, useSyncExternalStore } from "react";
import type { BaselinesReport, RecurringCostsResponse } from "@joint/contracts";
import { useNativeFinance } from "../finance/context";
import {
  financeErrorMessage,
  needsFinanceReconciliation,
} from "../finance/errors";
import { financeAuthorityKey } from "../finance/scope";
import { useFinanceLifetime } from "../finance/use-lifetime";

export interface RecurringDataState {
  recurring: RecurringCostsResponse | null;
  baselines: BaselinesReport | null;
  loading: boolean;
  error: string | null;
}

export type RecurringDataResult = RecurringDataState & {
  reload(): void;
};

const initial: RecurringDataState = {
  recurring: null,
  baselines: null,
  loading: true,
  error: null,
};

export function useRecurringData(): RecurringDataResult {
  const finance = useNativeFinance();
  const authority = finance.authority;
  const authorityKey = authority ? financeAuthorityKey(authority) : "";

  const store = useMemo(() => {
    let snapshot: RecurringDataState = initial;
    let controller: AbortController | null = null;
    let active = false;
    const listeners = new Set<() => void>();

    const publish = (next: RecurringDataState) => {
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
      publish({ ...snapshot, loading: true, error: null });

      Promise.all([
        finance.spending.readRecurringCosts(
          authority.householdId,
          undefined,
          nextController.signal,
        ),
        finance.spending.readBaselines(
          authority.householdId,
          undefined,
          nextController.signal,
        ),
      ])
        .then(([recurring, baselines]) => {
          if (!nextController.signal.aborted && current()) {
            publish({
              recurring,
              baselines,
              loading: false,
              error: null,
            });
          }
        })
        .catch((error) => {
          if (nextController.signal.aborted || !current()) return;
          if (needsFinanceReconciliation(error) && authority) {
            void finance.reconcile(authority);
          }
          publish({
            recurring: null,
            baselines: null,
            loading: false,
            error: financeErrorMessage(error),
          });
        });
    };

    return {
      getSnapshot: () => snapshot,
      subscribe: (listener: () => void) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
      start: () => {
        active = true;
        load();
      },
      stop: () => {
        active = false;
        controller?.abort();
        controller = null;
      },
      reload: load,
    };
  }, [finance, authority, authorityKey]);

  useFinanceLifetime(finance, authority, store);

  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot);

  return {
    ...snapshot,
    reload: store.reload,
  };
}
