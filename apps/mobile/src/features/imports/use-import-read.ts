import type { ImportBatchResponse } from "@joint/contracts";
import type { NativeFinanceContextValue } from "../finance/context";
import { useFencedRead, type FencedReadState } from "../writes/use-fenced-read";

const load = (
  finance: NativeFinanceContextValue,
  householdId: string,
  id: string,
  signal: AbortSignal,
) => finance.imports.read(householdId, id, signal);

/** One fenced read of a batch for the write screens; the live view is `useImportBatch`. */
export function useImportRead(batchId: string): {
  state: FencedReadState<ImportBatchResponse>;
  reload(): void;
} {
  return useFencedRead(batchId, load);
}
