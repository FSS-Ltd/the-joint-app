import { useState } from "react";
import type { AccountsApi } from "../../api/accounts";
import type { FinanceResourceResult } from "../finance/state";
import {
  useNativeFinance,
  type NativeFinanceContextValue,
} from "../finance/context";
import { financeAuthorityKey } from "../finance/scope";
import { useFinanceResource } from "../finance/use-resource";

type AccountPageResult = {
  resource: FinanceResourceResult<Awaited<ReturnType<AccountsApi["list"]>>>;
  firstPage: boolean;
  canGoBack: boolean;
  reset(): void;
  next(): void;
  previous(): void;
};

type PageState = {
  key: string;
  owner: NativeFinanceContextValue;
  cursor?: string;
  previous: (string | undefined)[];
};

/** Keep cursor metadata only; moving pages replaces the sole live page resource. */
export function useAccountPage(): AccountPageResult {
  const finance = useNativeFinance();
  const authority = finance.authority;
  const key = authority ? financeAuthorityKey(authority) : "unavailable";
  const firstPage: PageState = { key, owner: finance, previous: [] };
  const [page, setPage] = useState<PageState>(firstPage);
  // A refreshed provider can preserve authority values; reconciliation still discards navigation history.
  const current = page.key === key && page.owner === finance ? page : firstPage;
  const cursor = current.cursor;
  const resource = useFinanceResource(
    {
      kind: "accounts",
      householdId:
        authority?.householdId ?? "00000000-0000-4000-8000-000000000000",
      limit: 50,
      ...(cursor ? { cursor } : {}),
    },
    (scope, signal) => {
      if (scope.selector.kind !== "accounts")
        throw new Error("Expected account page scope.");
      return finance.accounts.list(
        scope.householdId,
        {
          limit: scope.selector.limit,
          ...(scope.selector.cursor ? { cursor: scope.selector.cursor } : {}),
        },
        signal,
      );
    },
  );
  return {
    resource,
    firstPage: cursor === undefined,
    canGoBack: current.previous.length > 0,
    reset: () => setPage(firstPage),
    next: () => {
      if (
        authority &&
        finance.isCurrent(authority) &&
        resource.kind === "ready" &&
        resource.value.nextCursor
      )
        setPage({
          key,
          owner: finance,
          cursor: resource.value.nextCursor,
          previous: [...current.previous, cursor].slice(-64),
        });
    },
    previous: () => {
      if (
        authority &&
        finance.isCurrent(authority) &&
        current.previous.length > 0
      )
        setPage({
          key,
          owner: finance,
          cursor: current.previous.at(-1),
          previous: current.previous.slice(0, -1),
        });
    },
  };
}
