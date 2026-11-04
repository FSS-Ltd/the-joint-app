import { statusSubscriptionQuery } from "@joint/contracts";
import { useMemo, useRef, useSyncExternalStore } from "react";
import { NativeResourceController } from "../../events/resource";
import {
  captureResourceScope,
  type NativeResourceScope,
} from "../../events/scope";
import { useNativeFinance } from "./context";
import {
  NativeApiError,
  financeErrorMessage,
  needsFinanceReconciliation,
} from "./errors";
import { assertFinanceResult } from "./result";
import { financeAuthorityKey } from "./scope";
import type { FinanceResourceSnapshot, FinanceResourceResult } from "./state";
import { useFinanceLifetime } from "./use-lifetime";

const loading = { kind: "loading" } as const;

export function useFinanceResource<T>(
  selector: NativeResourceScope["selector"],
  read: (scope: NativeResourceScope, signal: AbortSignal) => Promise<T>,
): FinanceResourceResult<T> {
  const finance = useNativeFinance();
  const key = statusSubscriptionQuery(selector);
  const authorityKey = finance.authority
    ? financeAuthorityKey(finance.authority)
    : "";
  const fullKey = JSON.stringify([authorityKey, key]);
  const refused = useRef<{ key: string; message: string } | null>(null);
  const cursor = useRef<{ key: string; authority: string } | null>(null);
  if (selector.kind === "accounts" && selector.cursor !== undefined) {
    if (!cursor.current || cursor.current.key !== key)
      cursor.current = { key, authority: authorityKey };
  } else cursor.current = null;
  const cursorAllowed =
    cursor.current === null || cursor.current.authority === authorityKey;
  // Scope keys capture the matching reader; render-created callbacks do not restart subscriptions.
  const store = useMemo(() => {
    const authority = finance.authority;
    const scope = authority
      ? captureResourceScope({ ...authority, selector })
      : null;
    let snapshot: FinanceResourceSnapshot<T> = loading;
    let controller: NativeResourceController<T> | undefined;
    let active = false;
    const listeners = new Set<() => void>();
    const publish = (value: FinanceResourceSnapshot<T>) => {
      snapshot = value;
      listeners.forEach((listener) => listener());
    };
    const current = () =>
      active && authority !== null && finance.isCurrent(authority);
    const store = {
      getSnapshot: () => snapshot,
      subscribe(listener: () => void) {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
      start(force = false) {
        if (controller || !scope || !authority || !finance.isCurrent(authority))
          return;
        active = true;
        if (!cursorAllowed) {
          publish({
            kind: "error",
            message: financeErrorMessage(
              new NativeApiError(400, "INVALID_CURSOR"),
            ),
          });
          return;
        }
        if (!force && refused.current?.key === fullKey) {
          publish({ kind: "error", message: refused.current.message });
          return;
        }
        controller = new NativeResourceController({
          scope,
          transport: finance.identity.transport,
          async read(captured, signal) {
            const value = await read(captured, signal);
            assertFinanceResult(value, captured);
            return value;
          },
          receive(value) {
            if (current()) {
              if (refused.current?.key === fullKey) refused.current = null;
              publish({ kind: "ready", value });
            }
          },
          unavailable() {
            publish(loading);
          },
          failure(error) {
            if (!current()) return;
            publish({ kind: "error", message: financeErrorMessage(error) });
            if (
              authority &&
              needsFinanceReconciliation(error) &&
              refused.current?.key !== fullKey
            ) {
              refused.current = {
                key: fullKey,
                message: financeErrorMessage(error),
              };
              void finance.reconcile(authority);
            }
          },
          revoke: (actor) => finance.identity.revoke(actor),
        });
        controller.start();
      },
      stop() {
        active = false;
        controller?.close();
        controller = undefined;
        publish(loading);
      },
      retry() {
        if (current()) {
          if (controller) controller.retry();
          else store.start(true);
        }
      },
    };
    return store;
  }, [finance, key, fullKey, cursorAllowed]);
  const visible = useFinanceLifetime(finance, finance.authority, store);
  const snapshot = useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    store.getSnapshot,
  );
  return { ...(visible ? snapshot : loading), retry: store.retry };
}
