"use client";
import type { ReactNode } from "react";
import type { AccountResponse } from "@joint/contracts";
import { useAccountList } from "./use-account-list";

export function AccountSelector({
  householdId,
  current,
}: {
  householdId: string;
  current: AccountResponse;
}): ReactNode {
  const { items, nextCursor, loading, error, load } =
    useAccountList(householdId);
  const choices = items.some((item) => item.id === current.id)
    ? items
    : [current, ...items];
  const content = (
    <div className="account-selector-content">
      <p className="field-hint">
        Only accounts you can view. Ownership and viewing access are separate.
      </p>
      {loading && <p role="status">Loading account selection…</p>}
      {error && (
        <>
          <p role="alert">{error}</p>
          <button
            className="text-button"
            type="button"
            onClick={() => void load()}
          >
            Try again
          </button>
        </>
      )}
      {!error &&
        choices.map((item) => {
          const account = item.id === current.id ? current : item;
          return (
            <a
              key={account.id}
              href={`/accounts/${account.id}`}
              aria-current={account.id === current.id ? "page" : undefined}
            >
              <span>{account.label}</span>
              <small>
                {account.ownership === "OWNED" ? "Yours" : "Shared with you"}
              </small>
            </a>
          );
        })}
      {!loading && !error && !items.length && (
        <p>No additional accounts loaded.</p>
      )}
      {nextCursor && (
        <button
          className="text-button"
          type="button"
          disabled={loading}
          onClick={() => void load(nextCursor)}
        >
          Load more accounts
        </button>
      )}
      <a className="account-selector-back" href="/accounts">
        All accounts<span aria-hidden="true">↗</span>
      </a>
    </div>
  );
  return (
    <nav className="account-selector" aria-label="Account selection">
      <div className="account-selector-desktop">
        <h2>Account scope</h2>
        {content}
      </div>
      <details className="account-selector-mobile">
        <summary>
          Choose account<span aria-hidden="true">＋</span>
        </summary>
        {content}
      </details>
    </nav>
  );
}
