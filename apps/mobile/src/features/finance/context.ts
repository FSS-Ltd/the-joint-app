import { createContext, useContext } from "react";
import type { AccountsApi } from "../../api/accounts";
import type { WealthApi } from "../../api/wealth";
import type { NativeIdentityBridge } from "../identity/bridge";
import type { NativeFinanceAuthority } from "./scope";

export interface NativeFinanceContextValue {
  readonly authority: NativeFinanceAuthority | null;
  readonly identity: NativeIdentityBridge;
  readonly accounts: AccountsApi;
  readonly wealth: WealthApi;
  isCurrent(authority: NativeFinanceAuthority): boolean;
  reconcile(authority: NativeFinanceAuthority): Promise<void>;
}
export const FinanceContext = createContext<NativeFinanceContextValue | null>(
  null,
);
export function useNativeFinance(): NativeFinanceContextValue {
  const value = useContext(FinanceContext);
  if (!value) throw new Error("Native finance provider is required.");
  return value;
}
