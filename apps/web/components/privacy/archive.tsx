"use client";
import { useEffect, useState, type ReactNode } from "react";
import type { AccountResponse, TransactionResponse } from "@joint/contracts";
import { formatMoney } from "@joint/domain";
import { kinds, ownerLabel, displayDate } from "../accounts/presentation";
import { AccountsFrame } from "../accounts/frame";
import { Feedback } from "../identity/frame";
import { errorMessage, request } from "../identity/client";
import { useIdentity } from "../identity/use-identity";
import { ExportPanel } from "./export-panel";
import { usePrivacyAccounts } from "./use-privacy-accounts";
import "./privacy.css";

function ArchiveActivity({ account }: { account: AccountResponse }): ReactNode {
  const [items, setItems] = useState<TransactionResponse[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState<string | undefined>();
  useEffect(() => {
    let current = true;
    setLoading(true);
    setError("");
    void request<{ items: TransactionResponse[]; nextCursor: string | null }>(
      `/api/me/archive/accounts/${account.id}/transactions?${new URLSearchParams({ limit: "50", ...(page ? { cursor: page } : {}) })}`,
    )
      .then((result) => {
        if (current) {
          setItems((old) => (page ? [...old, ...result.items] : result.items));
          setCursor(result.nextCursor);
        }
      })
      .catch((cause) => {
        if (current) {
          setItems([]);
          setCursor(null);
          setError(errorMessage(cause));
        }
      })
      .finally(() => {
        if (current) setLoading(false);
      });
    return () => {
      current = false;
    };
  }, [account.id, page]);
  return (
    <section className="surface form-card">
      <p className="step-label">Read only</p>
      <h2>{account.label}</h2>
      <p>
        {kinds[account.kind]} · {ownerLabel(account)}
      </p>
      <p>
        {account.latestValuation
          ? `${formatMoney(account.latestValuation.money)} · As of ${displayDate(account.latestValuation.asOfDate)}`
          : "No recorded balance"}
      </p>
      <Feedback error={error} />
      {loading && <p role="status">Loading archived history…</p>}
      {!loading && !error && !items.length && <p>No archived transactions.</p>}
      <ul className="privacy-activity">
        {items.map((item) => (
          <li key={item.id}>
            <strong>{item.description}</strong>
            <p>
              {displayDate(item.bookedDate)} · {formatMoney(item.money)}
            </p>
            {item.note.body && <p>Your note: {item.note.body}</p>}
          </li>
        ))}
      </ul>
      {cursor && (
        <button
          className="button secondary"
          disabled={loading}
          onClick={() => setPage(cursor)}
        >
          Load more history
        </button>
      )}
      {error && (
        <button
          className="button secondary"
          onClick={() => {
            setPage(undefined);
            window.location.reload();
          }}
        >
          Try again
        </button>
      )}
    </section>
  );
}
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
          <p className="privacy-readonly">
            Read and export only. You can see your legally owned history. Former
            household grants no longer give access. This archive cannot edit,
            import or share.
          </p>
          <div className="privacy-layout">
            <div className="privacy-stack">
              <section className="surface form-card">
                <h2>Archived accounts</h2>
                {list.loading && <p role="status">Loading accounts…</p>}
                {!list.loading && !list.error && !list.accounts.length && (
                  <p>No accounts owned by you are available in the archive.</p>
                )}
                {list.accounts.map((item) => (
                  <button
                    className="button secondary"
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
              {account && (
                <ArchiveActivity key={account.id} account={account} />
              )}
            </div>
            <ExportPanel
              accounts={list.accounts}
              path="/api/me/archive/exports"
              refreshing={list.loading}
              scopeError={Boolean(list.error)}
              actor={identity.user.id}
              onAccessChanged={() => void list.load()}
            />
          </div>
        </>
      )}
    </AccountsFrame>
  );
}
