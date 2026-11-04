import { useCallback, useLayoutEffect } from "react";
import { AppState } from "react-native";
import { useFocusEffect, useIsFocused } from "expo-router";
import type { NativeFinanceContextValue } from "./context";
import type { NativeFinanceAuthority } from "./scope";

/** Direct listeners fence continuations before React commits another render. */
export function useFinanceLifetime(
  finance: NativeFinanceContextValue,
  authority: NativeFinanceAuthority | null,
  lifetime: { start(): void; stop(): void },
): boolean {
  const focused = useIsFocused();
  useFocusEffect(
    useCallback(() => {
      let inFocus = true;
      const current = () =>
        inFocus &&
        authority !== null &&
        finance.isCurrent(authority) &&
        AppState.currentState === "active";
      const unsubscribe = finance.identity.subscribe(() => {
        if (!current()) lifetime.stop();
      });
      const subscription = AppState.addEventListener("change", (state) => {
        if (state !== "active") lifetime.stop();
        else if (current()) lifetime.start();
      });
      if (current()) lifetime.start();
      return () => {
        inFocus = false;
        lifetime.stop();
        unsubscribe();
        subscription.remove();
      };
    }, [finance, authority, lifetime]),
  );
  useLayoutEffect(() => () => lifetime.stop(), [lifetime]);
  return (
    focused &&
    AppState.currentState === "active" &&
    authority !== null &&
    finance.isCurrent(authority)
  );
}
