import type { TransactionResponse } from "@joint/contracts";
import type { NativeFinanceContextValue } from "../finance/context";
import { useFencedRead, type FencedReadState } from "../writes/use-fenced-read";

export type TransactionReadState = FencedReadState<TransactionResponse>;
const load = (
  finance: NativeFinanceContextValue,
  householdId: string,
  id: string,
  signal: AbortSignal,
) => finance.transactions.read(householdId, id, signal);

/** One fenced read per authority; no polling and no implicit retry. */
export function useTransactionRead(transactionId: string): {
  state: TransactionReadState;
  reload(): void;
} {
  return useFencedRead(transactionId, load);
}
