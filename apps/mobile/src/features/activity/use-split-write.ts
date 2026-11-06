import {
  splitsAllowed,
  splitsDraft,
  splitsInput,
  type SplitsDraft,
} from "./split-input";
import { splitsWriteIntent } from "./split-intent";
import {
  useTransactionWrite,
  type TransactionWriteSession,
  type TransactionWriteSpec,
} from "./use-transaction-write";

export type SplitSession = TransactionWriteSession<SplitsDraft>;
const spec: TransactionWriteSpec<SplitsDraft> = {
  name: "splits",
  empty: () => ({ lines: [] }),
  draft: splitsDraft,
  allowed: splitsAllowed,
  intent(finance, transaction, draft) {
    const input = splitsInput(transaction, draft);
    return input.ok
      ? {
          ok: true,
          value: splitsWriteIntent(finance, transaction, input.value),
        }
      : input;
  },
};
export function useSplitWrite(transactionId: string): SplitSession {
  return useTransactionWrite(transactionId, spec);
}
