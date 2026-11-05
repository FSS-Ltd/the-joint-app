import { useLayoutEffect } from "react";
import type { AccountResponse } from "@joint/contracts";
import { useNativeFinance } from "../finance/context";
import { financeErrorMessage } from "../finance/errors";
import { useFinanceMutation } from "../finance/use-mutation";
import { useFinanceResource } from "../finance/use-resource";
import { useWriteDraft } from "./use-write-draft";
import {
  accountWriteIntent,
  canWriteAccount,
  type AccountOperation,
  type AccountWrite,
} from "./write-intent";

import type { AccountWriteSession } from "./write-state";

function sameBase(
  base: AccountResponse,
  current: AccountResponse,
  operation: AccountOperation,
): boolean {
  return (
    base.id === current.id &&
    base.version === current.version &&
    (operation !== "sharing" ||
      (base.sharing?.version === current.sharing?.version &&
        base.sharing?.membershipId === current.sharing?.membershipId))
  );
}
export function useAccountWrite<T>(
  accountId: string,
  operation: AccountOperation,
  empty: () => T,
  initialize: (account: AccountResponse) => T,
): AccountWriteSession<T> {
  const finance = useNativeFinance();
  const resource = useFinanceResource(
    {
      kind: "account",
      householdId:
        finance.authority?.householdId ??
        "00000000-0000-4000-8000-000000000000",
      id: accountId,
    },
    (scope, signal) =>
      finance.accounts.read(scope.householdId, accountId, signal),
  );
  const draft = useWriteDraft(`${operation}:${accountId}`, empty);
  const mutation = useFinanceMutation<AccountResponse>(
    `${operation}:${accountId}`,
  );
  const account = resource.kind === "ready" ? resource.value : null;
  useLayoutEffect(() => {
    if (!account) return;
    const targetLost =
      operation === "sharing" &&
      draft.base !== null &&
      draft.base.sharing?.membershipId !== account.sharing?.membershipId;
    if (!canWriteAccount(account, operation) || targetLost) {
      draft.invalidate();
      mutation.reset();
    } else draft.initialize(account, initialize(account));
  }, [
    account,
    draft.initialize,
    draft.invalidate,
    draft.base,
    mutation.reset,
    operation,
    initialize,
  ]);
  const allowed = account !== null && canWriteAccount(account, operation);
  const stale =
    account !== null &&
    draft.base !== null &&
    !sameBase(draft.base, account, operation);
  const editable =
    draft.visible &&
    !draft.invalidated &&
    allowed &&
    draft.base !== null &&
    !stale &&
    mutation.kind === "idle";
  function reload() {
    mutation.reset();
    draft.clear();
    resource.retry();
  }
  async function submit(write: AccountWrite): Promise<void> {
    const current = resource.current();
    if (
      !draft.visible ||
      !current ||
      !draft.base ||
      !canWriteAccount(current, operation) ||
      !sameBase(draft.base, current, operation) ||
      write.kind !== operation ||
      mutation.kind !== "idle"
    )
      return;
    try {
      await mutation.submit(accountWriteIntent(finance, current, write));
    } catch (error) {
      draft.error(financeErrorMessage(error));
    }
  }
  return {
    resource,
    draft,
    mutation,
    account,
    allowed,
    stale,
    editable,
    reload,
    submit,
  };
}
