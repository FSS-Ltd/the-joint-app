import { useMemo, useSyncExternalStore } from "react";
import type { AccountResponse } from "@joint/contracts";
import { useNativeFinance } from "../finance/context";
import { useFinanceLifetime } from "../finance/use-lifetime";

import type { WriteDraft } from "./write-state";

/** Ephemeral form data belongs to one authorized route lifetime, never durable storage. */
export function useWriteDraft<T>(
  targetKey: string,
  empty: () => T,
): WriteDraft<T> {
  const finance = useNativeFinance();
  const store = useMemo(() => {
    let active = false;
    const blank = (): Pick<
      WriteDraft<T>,
      "base" | "value" | "message" | "invalidated"
    > => ({
      base: null,
      value: empty(),
      message: "",
      invalidated: false,
    });
    let snapshot = blank();
    const listeners = new Set<() => void>();
    const current = () =>
      active &&
      finance.authority !== null &&
      finance.isCurrent(finance.authority);
    const publish = (next: typeof snapshot) => {
      snapshot = next;
      listeners.forEach((listener) => listener());
    };
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
        publish(blank());
      },
      clear() {
        publish(blank());
      },
      invalidate() {
        publish({ ...blank(), invalidated: true });
      },
      initialize(base: AccountResponse, value: T) {
        if (current() && !snapshot.base && !snapshot.invalidated)
          publish({ base, value, message: "", invalidated: false });
      },
      change(value: T) {
        if (current() && !snapshot.invalidated)
          publish({ ...snapshot, value, message: "" });
      },
      error(message: string) {
        if (current()) publish({ ...snapshot, message });
      },
    };
  }, [finance, targetKey]);
  const visible = useFinanceLifetime(finance, finance.authority, store);
  const snapshot = useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    store.getSnapshot,
  );
  return {
    ...snapshot,
    visible,
    initialize: store.initialize,
    change: store.change,
    clear: store.clear,
    invalidate: store.invalidate,
    error: store.error,
  };
}
