"use client";
import { useState, type ReactNode } from "react";
import { AccountsFrame } from "../accounts/frame";
import { Feedback } from "../identity/frame";
import { AccountPicker, useFinanceScope } from "../finance/scope";
import { EntryForm } from "./entry-form";
import { ActivityList } from "./list";

export function Activity(): ReactNode {
  const scope = useFinanceScope();
  const [revision, setRevision] = useState(0);
  return (
    <AccountsFrame
      active="activity"
      title="Everyday activity"
      description="Your booked transactions, with the source and the choices kept clear."
      household={scope.identity?.membership?.household.name}
    >
      <div className="finance-stack">
        <Feedback error={scope.error} />
        {scope.loading && <p role="status">Loading accounts…</p>}
        <AccountPicker
          account={scope.account}
          accounts={scope.accounts}
          path="/activity"
          loading={scope.loading}
          more={Boolean(scope.nextCursor)}
          onMore={() => void scope.moreAccounts()}
        />
        {!scope.loading && !scope.account && !scope.error && (
          <section className="surface finance-empty">
            <h2>Activity starts with an account</h2>
            <p>
              Choose an account you own or one shared with Values and details
              access.
            </p>
            <a className="button primary" href="/accounts">
              Go to accounts
            </a>
          </section>
        )}
        {scope.account && scope.householdId && (
          <>
            <div className="finance-section-title">
              <p>
                {scope.account.ownership === "OWNED"
                  ? "Your account"
                  : "Shared with you"}{" "}
                · Values and details
              </p>
              {scope.account.ownership === "OWNED" && (
                <a
                  className="button secondary compact-button"
                  href={`/imports?account=${scope.account.id}`}
                >
                  Import CSV
                </a>
              )}
            </div>
            <div
              className={
                scope.account.ownership === "OWNED"
                  ? "activity-layout"
                  : "finance-stack"
              }
            >
              <ActivityList
                key={scope.account.id}
                householdId={scope.householdId}
                accountId={scope.account.id}
                revision={revision}
              />
              {scope.account.ownership === "OWNED" && (
                <EntryForm
                  key={scope.account.id}
                  householdId={scope.householdId}
                  accountId={scope.account.id}
                  saved={() => setRevision((value) => value + 1)}
                />
              )}
            </div>
          </>
        )}
      </div>
    </AccountsFrame>
  );
}
