"use client";
import { useState, type ReactNode } from "react";
import { AccountsFrame } from "../accounts/frame";
import { Feedback } from "../identity/frame";
import { ArchiveActivity } from "./archive-activity";
import { useIdentity } from "../identity/use-identity";
import { ExportPanel } from "./export-panel";
import { usePrivacyAccounts } from "./use-privacy-accounts";
import "./privacy.css";

export function Archive(): ReactNode {
  const { identity, loading, error } = useIdentity();
  const list = usePrivacyAccounts(identity ? "/api/me/archive/accounts" : null);
  const [selected, setSelected] = useState<string>("");
  const account = list.accounts.find((item) => item.id === selected);
  return (
    <AccountsFrame
      title="Your owner archive."
      description="A quiet place for the accounts you own. Read and export only."
      active="archive"
    >
      <Feedback error={error || list.error} />
      {loading && <p role="status">Loading your archive…</p>}
      {identity?.membership && (
        <section className="surface form-card">
          <h2>Your household is active</h2>
          <p>
            Your current accounts are available in your household. Accounts you
            legally owned in a former household remain in this read-only
            archive.
          </p>
          <a className="button primary" href="/settings/privacy">
            Open privacy settings
          </a>
        </section>
      )}
      {identity && (
        <>
          <div className="archive-introduction-frame">
            <p className="privacy-readonly">
              Read and export only. You can see your legally owned history.
              Former household grants no longer give access. This archive cannot
              edit, import or share.
            </p>
          </div>
          <div className="privacy-workspace archive-layout">
            <section
              className="surface archive-selector"
              aria-label="Archived accounts"
            >
              <h2>Archived accounts</h2>
              <p className="field-hint">
                {list.accounts.length} loaded{" "}
                {list.accounts.length === 1 ? "account" : "accounts"} · Only
                accounts you own
              </p>
              {list.loading && <p role="status">Loading accounts…</p>}
              {!list.loading && !list.error && !list.accounts.length && (
                <p>No accounts owned by you are available in the archive.</p>
              )}
              {list.accounts.map((item) => (
                <button
                  className="archive-account-choice"
                  key={item.id}
                  aria-pressed={selected === item.id}
                  onClick={() => setSelected(item.id)}
                >
                  {item.label} · Read history
                </button>
              ))}
              {list.cursor && (
                <button
                  className="text-button"
                  disabled={list.loading}
                  onClick={() => void list.load(list.cursor ?? undefined)}
                >
                  Load more accounts
                </button>
              )}
              {list.error && (
                <button
                  className="button secondary"
                  onClick={() => void list.load()}
                >
                  Try again
                </button>
              )}
            </section>
            <div className="privacy-stack">
              {account ? (
                <ArchiveActivity key={account.id} account={account} />
              ) : (
                <section className="surface form-card archive-history">
                  <h2>Read your owned history</h2>
                  <p>
                    Select an archived account to see its recorded value and
                    transactions. This space cannot edit, import or share.
                  </p>
                </section>
              )}
              <ExportPanel
                accounts={list.accounts}
                path="/api/me/archive/exports"
                refreshing={list.loading}
                scopeError={Boolean(list.error)}
                actor={identity.user.id}
                onAccessChanged={() => void list.load()}
              />
            </div>
          </div>
        </>
      )}
    </AccountsFrame>
  );
}
