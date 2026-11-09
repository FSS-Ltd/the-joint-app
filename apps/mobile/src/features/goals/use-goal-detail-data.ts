import { useMemo, useSyncExternalStore } from "react";
import type {
  GoalDto,
  GoalAllocationPage,
  ContributionBudgetView,
  ProjectionRunDto,
} from "@joint/contracts";
import { useNativeFinance } from "../finance/context";
import {
  financeErrorMessage,
  needsFinanceReconciliation,
} from "../finance/errors";
import { financeAuthorityKey } from "../finance/scope";
import { useFinanceLifetime } from "../finance/use-lifetime";

export interface GoalDetailState {
  goal: GoalDto | null;
  allocations: GoalAllocationPage | null;
  contributions: ContributionBudgetView | null;
  latestProjection: ProjectionRunDto | null;
  loading: boolean;
  error: string | null;
}

export type GoalDetailResult = GoalDetailState & {
  reload(): void;
};

const initial: GoalDetailState = {
  goal: null,
  allocations: null,
  contributions: null,
  latestProjection: null,
  loading: true,
  error: null,
};

export function useGoalDetailData(goalId: string): GoalDetailResult {
  const finance = useNativeFinance();
  const authority = finance.authority;
  const authorityKey = authority ? financeAuthorityKey(authority) : "";

  const store = useMemo(() => {
    let snapshot: GoalDetailState = initial;
    let controller: AbortController | null = null;
    let active = false;
    const listeners = new Set<() => void>();

    const publish = (next: GoalDetailState) => {
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

      const hh = authority.householdId;
      const signal = nextController.signal;

      Promise.all([
        finance.goals.readGoal(hh, goalId, undefined, signal),
        finance.goals
          .readAllocations(hh, goalId, undefined, undefined, signal)
          .catch(() => null),
        finance.goals
          .readContributionPlan(hh, goalId, signal)
          .catch(() => null),
        finance.goals.listProjections(hh, goalId, signal).catch(() => null),
      ])
        .then(([goalPage, allocations, contributions, projectionsList]) => {
          if (!signal.aborted && current()) {
            publish({
              goal: goalPage.goal,
              allocations,
              contributions,
              latestProjection: projectionsList?.runs[0] ?? null,
              loading: false,
              error: null,
            });
          }
        })
        .catch((error: unknown) => {
          if (signal.aborted || !current()) return;
          if (needsFinanceReconciliation(error)) {
            void finance.reconcile(authority);
          }
          publish({
            goal: null,
            allocations: null,
            contributions: null,
            latestProjection: null,
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
  }, [authority, authorityKey, finance, goalId]);

  useFinanceLifetime(finance, authority, store);

  const state = useSyncExternalStore(store.subscribe, store.getSnapshot);

  return {
    ...state,
    reload: store.reload,
  };
}
