import { useMemo, useSyncExternalStore } from "react";
import type { GoalDto } from "@joint/contracts";
import { useNativeFinance } from "../finance/context";
import {
  financeErrorMessage,
  needsFinanceReconciliation,
} from "../finance/errors";
import { financeAuthorityKey } from "../finance/scope";
import { useFinanceLifetime } from "../finance/use-lifetime";

export interface GoalsDataState {
  goals: readonly GoalDto[];
  loading: boolean;
  error: string | null;
}

export type GoalsDataResult = GoalsDataState & {
  reload(): void;
};

const initial: GoalsDataState = {
  goals: [],
  loading: true,
  error: null,
};

export function useGoalsData(): GoalsDataResult {
  const finance = useNativeFinance();
  const authority = finance.authority;
  const authorityKey = authority ? financeAuthorityKey(authority) : "";

  const store = useMemo(() => {
    let snapshot: GoalsDataState = initial;
    let controller: AbortController | null = null;
    let active = false;
    const listeners = new Set<() => void>();

    const publish = (next: GoalsDataState) => {
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

      finance.goals
        .listGoals(authority.householdId, undefined, nextController.signal)
        .then((result) => {
          if (!nextController.signal.aborted && current()) {
            publish({
              goals: result.goals,
              loading: false,
              error: null,
            });
          }
        })
        .catch((error: unknown) => {
          if (nextController.signal.aborted || !current()) return;
          if (needsFinanceReconciliation(error)) {
            void finance.reconcile(authority);
          }
          publish({
            goals: [],
            loading: false,
            error: financeErrorMessage(error),
          });
        });
    };

    return {
      subscribe(onStoreChange: () => void) {
        listeners.add(onStoreChange);
        return () => {
          listeners.delete(onStoreChange);
        };
      },
      getSnapshot() {
        return snapshot;
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
      },
      reload() {
        if (authority && finance.isCurrent(authority)) load();
      },
    };
  }, [authority, authorityKey, finance]);

  useFinanceLifetime(finance, authority, store);

  const state = useSyncExternalStore(store.subscribe, store.getSnapshot);

  return {
    ...state,
    reload: store.reload,
  };
}
