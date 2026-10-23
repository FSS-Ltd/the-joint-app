"use client";
import { useEffect, useState, type ReactNode } from "react";
import { idempotencyKeySchema, type AccountResponse } from "@joint/contracts";
import { errorMessage, request } from "../identity/client";
import { useIdentity } from "../identity/use-identity";
import { useAccountList } from "../accounts/use-account-list";
import { accountPath } from "../accounts/presentation";
import "./finance.css";

interface FinanceScope {
  identity: ReturnType<typeof useIdentity>["identity"];
  householdId: string | undefined;
  account: AccountResponse | null;
  accounts: AccountResponse[];
  loading: boolean;
  error: string;
  nextCursor: string | null;
  moreAccounts: () => Promise<void>;
}
export function useFinanceScope(ownerOnly = false): FinanceScope {
  const identity = useIdentity();
  const householdId = identity.identity?.membership?.householdId;
  const list = useAccountList(householdId);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [account, setAccount] = useState<AccountResponse | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("account");
    setSelectedId(id ?? "");
  }, []);
  const eligible = list.items.filter((item) =>
    ownerOnly ? item.ownership === "OWNED" : item.access === "TRANSACTIONS",
  );
  const defaultId = eligible[0]?.id;
  useEffect(() => {
    if (selectedId === "" && defaultId) setSelectedId(defaultId);
  }, [selectedId, defaultId]);
  useEffect(() => {
    let current = true;
    setAccount(null);
    setError("");
    if (!householdId || !selectedId) {
      setLoading(false);
      return;
    }
    if (!idempotencyKeySchema.safeParse(selectedId).success) {
      setError("Choose an available account.");
      setLoading(false);
      return;
    }
    setLoading(true);
    void request<AccountResponse>(accountPath(householdId, selectedId))
      .then((item) => {
        if (!current) return;
        if (
          ownerOnly
            ? item.ownership !== "OWNED"
            : item.access !== "TRANSACTIONS"
        ) {
          setError(
            ownerOnly
              ? "Only an owner can import into this account."
              : "Activity needs Values and details access.",
          );
          return;
        }
        setAccount(item);
      })
      .catch((cause) => {
        if (current) setError(errorMessage(cause));
      })
      .finally(() => {
        if (current) setLoading(false);
      });
    return () => {
      current = false;
    };
  }, [householdId, selectedId, ownerOnly]);
  return {
    identity: identity.identity,
    householdId,
    account,
    accounts:
      account && !eligible.some((item) => item.id === account.id)
        ? [account, ...eligible]
        : eligible,
    loading: identity.loading || list.loading || loading,
    error: identity.error || list.error || error,
    nextCursor: list.nextCursor,
    moreAccounts: () =>
      list.nextCursor ? list.load(list.nextCursor) : Promise.resolve(),
  };
}
export function AccountPicker({
  account,
  accounts,
  path,
  more,
  loading,
  onMore,
}: {
  account: AccountResponse | null;
  accounts: AccountResponse[];
  path: "/activity" | "/imports";
  more: boolean;
  loading: boolean;
  onMore: () => void;
}): ReactNode {
  return (
    <div className="finance-account-picker">
      <label htmlFor="finance-account">Account</label>
      <select
        id="finance-account"
        value={account?.id ?? ""}
        disabled={loading}
        onChange={(event) =>
          window.location.assign(`${path}?account=${event.target.value}`)
        }
      >
        <option value="" disabled>
          Choose an account
        </option>
        {accounts.map((item) => (
          <option key={item.id} value={item.id}>
            {item.label}
            {item.ownership === "SHARED" ? " · Shared with you" : " · Yours"}
          </option>
        ))}
      </select>
      {more && (
        <button
          className="text-button"
          disabled={loading}
          type="button"
          onClick={onMore}
        >
          Load more accounts
        </button>
      )}
    </div>
  );
}
