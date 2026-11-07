import type { ReactNode } from "react";
import { formatAggregateMoney } from "@joint/domain/cash-flow";
import { AppText } from "@/components/app-text";
import { EntityWriteBoundary } from "../writes/entity-write-boundary";
import type { TransactionWriteSession } from "./use-transaction-write";

/** Transaction copy and destinations over the shared write boundary. */
export function TransactionWriteBoundary<D>({
  session,
  transactionId,
  title,
  children,
}: {
  session: TransactionWriteSession<D>;
  transactionId: string;
  title: string;
  children: ReactNode;
}): React.JSX.Element {
  const detail = `/activity/${transactionId}`;
  return (
    <EntityWriteBoundary
      session={session}
      title={title}
      header={(transaction) => (
        <AppText tone="secondary">
          {transaction.description} · {formatAggregateMoney(transaction.money)}
        </AppText>
      )}
      viewOnly="You cannot make this change to this transaction."
      retryLabel="Retry transaction access"
      reloadLabel="Reload transaction"
      backHref={detail}
      backLabel="Back to transaction"
      outcome={{
        saved: "Saved. Open the transaction to review its latest details.",
        open: "Back to transaction",
        openHref: () => detail,
        check: "Check transaction",
        checkHref: detail,
      }}
    >
      {children}
    </EntityWriteBoundary>
  );
}
