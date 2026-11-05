import type { AccountResponse } from "@joint/contracts";
import type {
  FinanceMutationResult,
  FinanceResourceResult,
} from "../finance/state";
import type { AccountOperation, AccountWrite } from "./write-intent";
export interface WriteDraft<T> {
  base: AccountResponse | null;
  value: T;
  message: string;
  visible: boolean;
  invalidated: boolean;
  invalidate(): void;
  initialize(base: AccountResponse, value: T): void;
  change(value: T): void;
  clear(): void;
  error(message: string): void;
}
export type WriteDraftHook = <T>(
  targetKey: string,
  empty: () => T,
) => WriteDraft<T>;
export interface AccountWriteSession<T> {
  resource: FinanceResourceResult<AccountResponse>;
  draft: WriteDraft<T>;
  mutation: FinanceMutationResult<AccountResponse>;
  account: AccountResponse | null;
  allowed: boolean;
  stale: boolean;
  editable: boolean;
  reload(): void;
  submit(write: AccountWrite): Promise<void>;
}
export type AccountWriteHook = <T>(
  accountId: string,
  operation: AccountOperation,
  empty: () => T,
  initialize: (account: AccountResponse) => T,
) => AccountWriteSession<T>;
