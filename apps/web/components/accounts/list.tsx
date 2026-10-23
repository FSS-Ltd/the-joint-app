"use client";
import type { ReactNode } from "react";
import { Feedback } from "../identity/frame";
import { useIdentity } from "../identity/use-identity";
import { AccountRow } from "./row";
import { CollectionOverview } from "./collection-overview";
import "./workspace.css";
import { CreateAccountForm } from "./create-form";
import { AccountsFrame } from "./frame";
import { useAccountList } from "./use-account-list";

export function AccountList(): ReactNode {
  const {
    identity,
    loading: identityLoading,
    error: identityError,
    refresh,
  } = useIdentity();
  const membership = identity?.membership;
  const { items, nextCursor, loading, error, load } = useAccountList(
    membership?.householdId,
  );
  const owned = items.filter((account) => account.ownership === "OWNED");
  const shared = items.filter((account) => account.ownership === "SHARED");
  return (
    <AccountsFrame
      title="A clearer view, your way."
      description="Your accounts start private. Choose what to share, one account at a time."
      household={membership?.household.name}
    >
      <Feedback error={identityError || error} />
      {identityError && (
        <button
          className="button secondary compact-button"
          type="button"
          onClick={() => void refresh()}
        >
          Try again
        </button>
      )}
      {identityLoading && <p role="status">Loading your personal space…</p>}
      {identity &&
        !identityLoading &&
        (!membership ? (
          <section className="surface form-card">
            <h2>Start with your household</h2>
            <p>
              Create a household or accept an invitation before adding your
              accounts.
            </p>
            <a className="button primary compact-button" href="/household">
              Go to household<span aria-hidden="true">↗</span>
            </a>
          </section>
        ) : (
          <>
            {!loading && !error && (
              <CollectionOverview
                count={items.length}
                more={Boolean(nextCursor)}
              />
            )}
            <div className="accounts-layout">
              <div className="account-collection">
                <div className="account-section-title">
                  <h2>Your accounts</h2>
                  <button
                    className="text-button"
                    type="button"
                    disabled={loading}
                    onClick={() => void load()}
                  >
                    Refresh accounts
                  </button>
                </div>
                {loading && <p role="status">Loading accounts…</p>}
                {!loading && !error && items.length === 0 && (
                  <section className="surface account-empty">
                    <span className="empty-account-mark" aria-hidden="true">
                      ↗
                    </span>
                    <h3>A little space for your money.</h3>
                    <p>
                      No accounts to show yet. Add one you own, or let the other
                      adult choose what to share with you.
                    </p>
                    <p className="field-hint">
                      Only accounts you can access appear here.
                    </p>
                  </section>
                )}
                {owned.length > 0 && (
                  <section
                    className="account-group"
                    aria-labelledby="owned-heading"
                  >
                    <h3 id="owned-heading">Owned by you</h3>
                    <div className="account-grid">
                      {owned.map((account) => (
                        <AccountRow key={account.id} account={account} />
                      ))}
                    </div>
                  </section>
                )}
                {shared.length > 0 && (
                  <section
                    className="account-group"
                    aria-labelledby="shared-heading"
                  >
                    <h3 id="shared-heading">Shared with you</h3>
                    <p className="field-hint">
                      Viewing permission is separate from ownership.
                    </p>
                    <div className="account-grid">
                      {shared.map((account) => (
                        <AccountRow key={account.id} account={account} />
                      ))}
                    </div>
                  </section>
                )}
                {nextCursor && (
                  <button
                    className="button secondary"
                    type="button"
                    disabled={loading}
                    onClick={() => void load(nextCursor)}
                  >
                    {loading ? "Loading…" : "Load more accounts"}
                  </button>
                )}
              </div>
              <aside className="accounts-sidebar" aria-label="Add an account">
                <CreateAccountForm
                  householdId={membership.householdId}
                  verified={identity.session.aal === "aal2"}
                />
                <div className="accounts-private-note">
                  <p className="step-label">Together, on your terms</p>
                  <h2>
                    Shared home.
                    <br />
                    Personal choices.
                  </h2>
                  <p>
                    Being a household admin does not give access to another
                    person's private accounts.
                  </p>
                </div>
              </aside>
            </div>
          </>
        ))}
    </AccountsFrame>
  );
}
