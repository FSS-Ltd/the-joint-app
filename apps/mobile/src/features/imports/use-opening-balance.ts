import { useCallback, useLayoutEffect, useRef } from "react";
import { randomUUID } from "expo-crypto";
import type {
  AccountResponse,
  CsvBalance,
  ValuationInput,
} from "@joint/contracts";
import { useNativeFinance } from "../finance/context";
import { financeErrorMessage } from "../finance/errors";
import { useFinanceMutation } from "../finance/use-mutation";
import type { FinanceResourceResult } from "../finance/state";
import { accountWriteIntent, canWriteAccount } from "../accounts/write-intent";
import { openingBalanceInput } from "./opening-input";

export type ImportAccount = AccountResponse & { csvBalance: CsvBalance };

export function statementIsEligible(
  balance: CsvBalance,
  date: string,
): boolean {
  return (
    balance.status === "MISSING_ANCHOR" ||
    (balance.status === "AVAILABLE" && date > balance.anchorDate)
  );
}

export function useOpeningBalance({
  accountId,
  resource,
  active,
  canStart,
  statement,
  error,
}: {
  accountId: string;
  resource: FinanceResourceResult<ImportAccount>;
  active: boolean;
  canStart(): boolean;
  statement(): { money: ValuationInput["money"]; asOfDate: string } | undefined;
  error(message: string): void;
}) {
  const finance = useNativeFinance();
  const mutation = useFinanceMutation<AccountResponse>(
    `import-opening:${accountId}`,
  );
  const issued = useRef(false);
  const kind = useRef(mutation.kind);
  kind.current = mutation.kind;
  const live = useRef(active);
  live.current = active;
  const account = resource.kind === "ready" ? resource.value : null;
  useLayoutEffect(() => {
    if (
      mutation.kind === "success" &&
      account &&
      account.csvBalance.status !== "MISSING_ANCHOR" &&
      account.version >= mutation.value.version
    ) {
      issued.current = false;
      mutation.reset();
    }
  }, [account, mutation]);
  useLayoutEffect(() => {
    if (!active) issued.current = false;
  }, [active]);
  async function save(
    input: ValuationInput,
    statementOnly: boolean,
  ): Promise<void> {
    const current = resource.current();
    if (
      !live.current ||
      !canStart() ||
      issued.current ||
      !current ||
      (statementOnly
        ? !statementIsEligible(current.csvBalance, input.asOfDate)
        : current.csvBalance.status !== "MISSING_ANCHOR") ||
      !canWriteAccount(current, "valuation") ||
      (current.kind !== "CURRENT" && current.kind !== "SAVINGS")
    )
      return;
    try {
      const intent = accountWriteIntent(finance, current, {
        kind: "valuation",
        input,
        key: randomUUID(),
      });
      issued.current = true;
      await mutation.submit(async (signal) => {
        const saved = await intent(signal);
        resource.retry();
        return saved;
      });
    } catch (cause) {
      error(financeErrorMessage(cause));
    }
  }
  async function saveOpening(amount: string, date: string): Promise<void> {
    const current = resource.current();
    if (!current) return;
    const parsed = openingBalanceInput(current, amount, date);
    if (!parsed.ok) {
      error(parsed.message);
      return;
    }
    await save(parsed.value, false);
  }
  async function saveStatementBalance(input: ValuationInput): Promise<void> {
    const candidate = statement();
    if (
      !candidate ||
      candidate.asOfDate !== input.asOfDate ||
      candidate.money.currency !== input.money.currency ||
      candidate.money.amountMinor !== input.money.amountMinor ||
      input.adultMoney !== undefined
    )
      return;
    await save(input, true);
  }
  async function retry(): Promise<void> {
    const current = resource.current();
    if (
      !live.current ||
      !finance.authority ||
      !finance.isCurrent(finance.authority) ||
      !current ||
      !canWriteAccount(current, "valuation")
    )
      return;
    await mutation.retry();
  }
  const reset = useCallback((): void => {
    issued.current = false;
    mutation.reset();
  }, [mutation.reset]);
  function correct(): void {
    const current = resource.current();
    const rejected =
      kind.current === "error" &&
      mutation.kind === "error" &&
      mutation.recovery !== "security";
    const unusable =
      kind.current === "success" &&
      mutation.kind === "success" &&
      current?.csvBalance.status === "MISSING_ANCHOR" &&
      current.version >= mutation.value.version;
    if (
      (!rejected && !unusable) ||
      !live.current ||
      !finance.authority ||
      !finance.isCurrent(finance.authority) ||
      !current ||
      !canWriteAccount(current, "valuation")
    )
      return;
    reset();
    resource.retry();
  }
  return {
    correct,
    mutation: { ...mutation, retry },
    saveOpening,
    saveStatementBalance,
    reset,
    issued,
  };
}
