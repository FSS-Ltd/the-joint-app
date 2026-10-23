"use client";
import type { ReactNode } from "react";
import { AccountsFrame } from "../accounts/frame";
import { Feedback } from "../identity/frame";
import { AccountPicker, useFinanceScope } from "../finance/scope";
import { UploadForm } from "./upload-form";
import { ImportHistory } from "./history";

export function Imports(): ReactNode {
  const scope = useFinanceScope(true);
  return (
    <AccountsFrame
      active="activity"
      title="Bring your activity together."
      description="Inspect, map and review your CSV before any booked rows are published."
      household={scope.identity?.membership?.household.name}
    >
      <a
        className="form-link"
        href={
          scope.account ? `/activity?account=${scope.account.id}` : "/activity"
        }
      >
        Back to activity
      </a>
      <Feedback error={scope.error} />
      {scope.loading && <p role="status">Loading your accounts…</p>}
      {!scope.loading && !scope.accounts.length && !scope.error && (
        <section className="finance-empty">
          <h2>Choose an account you own.</h2>
          <p>
            Only an owner can import. Add a manual account before bringing in
            its CSV activity.
          </p>
          <a className="button primary compact-button" href="/accounts">
            Go to accounts
          </a>
        </section>
      )}
      <AccountPicker
        account={scope.account}
        accounts={scope.accounts}
        path="/imports"
        more={Boolean(scope.nextCursor)}
        loading={scope.loading}
        onMore={() => void scope.moreAccounts()}
      />
      {scope.account && scope.householdId && (
        <div className="finance-grid">
          <UploadForm
            key={scope.account.id}
            householdId={scope.householdId}
            accountId={scope.account.id}
          />
          <div className="finance-stack">
            <aside className="accounts-private-note">
              <p className="step-label">Review with care</p>
              <h2>Similar doesn't mean the same.</h2>
              <p>
                Equal purchases can both be real. Overlap warnings need an
                explicit Keep or Skip choice. An exact-file replay reuses its
                existing import.
              </p>
            </aside>
            <ImportHistory
              householdId={scope.householdId}
              accountId={scope.account.id}
            />
          </div>
        </div>
      )}
    </AccountsFrame>
  );
}
