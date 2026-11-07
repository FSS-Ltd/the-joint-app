import type { TransactionResponse } from "@joint/contracts";
import {
  useEntityWrite,
  type EntityWriteSession,
  type EntityWriteSpec,
} from "../writes/use-entity-write";
import { useTransactionRead } from "./use-transaction-read";

export type TransactionWriteSpec<D> = EntityWriteSpec<
  TransactionResponse,
  D,
  TransactionResponse
>;
export type TransactionWriteSession<D> = EntityWriteSession<
  TransactionResponse,
  D,
  TransactionResponse
>;
/** One kind of transaction write over the shared entity session. */
export function useTransactionWrite<D>(
  transactionId: string,
  spec: TransactionWriteSpec<D>,
): TransactionWriteSession<D> {
  return useEntityWrite(
    `${spec.name}:${transactionId}`,
    useTransactionRead(transactionId),
    spec,
  );
}
