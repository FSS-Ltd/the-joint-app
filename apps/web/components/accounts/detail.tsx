"use client";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import type { AccountResponse } from "@joint/contracts";
import { errorMessage, request } from "../identity/client";
import { Feedback } from "../identity/frame";
import { useIdentity } from "../identity/use-identity";
import { AccountCard } from "./card";
import { AccountsFrame } from "./frame";
import { MetadataForm } from "./metadata-form";
import { accountPath, liquidityLabels } from "./presentation";
import { SharingForm } from "./sharing-form";
import { ValuationForm } from "./valuation-form";

export function AccountDetail({ accountId }: { accountId: string }): ReactNode {
  const {
    identity,
    loading: identityLoading,
    error: identityError,
  } = useIdentity();
  const householdId = identity?.membership?.householdId;
  const [account, setAccount] = useState<AccountResponse | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [revision, setRevision] = useState(0);
  const reload = useCallback(() => setRevision((value) => value + 1), []);
  useEffect(() => {
    let current = true;
    setAccount(null);
    setError("");
    if (!householdId) return;
    setLoading(true);
    void request<AccountResponse>(accountPath(householdId, accountId))
      .then((result) => {
        if (current) setAccount(result);
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
  }, [householdId, accountId, revision]);
  return (
    <AccountsFrame
      title={account?.label ?? "Your account"}
      description="A manual record, with a clear date and your own sharing choices."
      household={identity?.membership?.household.name}
    >
      <a className="form-link account-back" href="/accounts">
        Back to accounts
      </a>
      <Feedback error={identityError || error} />
      {(identityLoading || loading) && <p role="status">Loading account…</p>}
      {error && (
        <button
          className="button secondary compact-button"
          type="button"
          onClick={reload}
        >
          Try again
        </button>
      )}
      {identity && !identityLoading && !householdId && (
        <a className="button primary compact-button" href="/household">
          Go to household
        </a>
      )}
      {account && !loading && (
        <>
          <div className="finance-actions">
            {account.access === "TRANSACTIONS" && (
              <a
                className="button secondary compact-button"
                href={`/activity?account=${account.id}`}
              >
                View activity
              </a>
            )}
            {account.ownership === "OWNED" && (
              <a
                className="button secondary compact-button"
                href={`/imports?account=${account.id}`}
              >
                Import CSV
              </a>
            )}
          </div>
          <div className="account-detail-summary">
            <AccountCard account={account} linked={false} />
            <aside className="accounts-private-note">
              <p className="step-label">Clear boundaries</p>
              <h2>
                {account.ownership === "OWNED"
                  ? "Your account. Your choice."
                  : "Shared access, clearly set."}
              </h2>
              <p>Availability: {liquidityLabels[account.liquidity]}.</p>
              <p>
                {account.ownership === "OWNED"
                  ? "Only an owner can change this account or its sharing permissions."
                  : account.access === "TRANSACTIONS"
                    ? "You can view the shared value and booked activity, and keep your own private notes. The owner controls account changes and sharing."
                    : "You can view the value shared with you. Account changes, activity and sharing controls belong to the owner."}
              </p>
            </aside>
          </div>
          <div className="account-detail-forms">
            <div className="account-form-column">
              {account.permissions.canValue && (
                <ValuationForm
                  key={`value-${account.id}`}
                  account={account}
                  saved={setAccount}
                  reload={reload}
                />
              )}
              {account.permissions.canEdit && (
                <MetadataForm
                  key={`metadata-${account.id}`}
                  account={account}
                  saved={setAccount}
                  reload={reload}
                />
              )}
            </div>
            <div className="account-form-column">
              {(account.permissions.canShare ||
                (account.ownership === "OWNED" &&
                  account.sharing?.membershipId === null)) && (
                <SharingForm
                  key={`sharing-${account.id}`}
                  account={account}
                  saved={setAccount}
                  reload={reload}
                />
              )}
            </div>
          </div>
        </>
      )}
    </AccountsFrame>
  );
}
