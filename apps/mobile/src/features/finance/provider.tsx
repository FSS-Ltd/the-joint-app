import type { MeResponse } from "@joint/contracts";
import { useMemo, useSyncExternalStore, type PropsWithChildren } from "react";
import { createAccountsApi } from "../../api/accounts";
import { createWealthApi } from "../../api/wealth";
import { createImportsApi } from "../../api/imports";
import { createTransactionsApi } from "../../api/transactions";
import { useIdentity } from "../identity/context";
import { FinanceContext, type NativeFinanceContextValue } from "./context";
import {
  captureFinanceAuthority,
  sameFinanceAuthority,
  type NativeFinanceAuthority,
} from "./scope";

export function NativeFinanceProvider({
  me,
  children,
}: PropsWithChildren<{ me: MeResponse }>): React.JSX.Element {
  const { finance: identity } = useIdentity();
  const verified = useSyncExternalStore(
    identity.subscribe,
    identity.getVerifiedIdentity,
    identity.getVerifiedIdentity,
  );
  const adapters = useMemo(
    () => ({
      accounts: createAccountsApi(identity.transport),
      wealth: createWealthApi(identity.transport),
      transactions: createTransactionsApi(identity.transport),
      imports: createImportsApi(identity.transport),
    }),
    [identity],
  );
  const value = useMemo<NativeFinanceContextValue>(() => {
    const isCurrent = (authority: NativeFinanceAuthority) =>
      sameFinanceAuthority(
        authority,
        captureFinanceAuthority(identity.getVerifiedIdentity(), me),
      );
    return {
      ...adapters,
      identity,
      authority: captureFinanceAuthority(verified, me),
      isCurrent,
      async reconcile(authority) {
        // refresh synchronously publishes loading, fencing every old-scope observer first.
        if (isCurrent(authority)) await identity.refresh();
      },
    };
  }, [adapters, identity, me, verified]);
  return (
    <FinanceContext.Provider value={value}>{children}</FinanceContext.Provider>
  );
}
