"use client";
import { useEffect, useState, type ReactNode } from "react";
import type { AccountResponse, TransactionResponse } from "@joint/contracts";
import { formatMoney } from "@joint/domain";
import { kinds, ownerLabel, displayDate } from "../accounts/presentation";
import { Feedback } from "../identity/frame";
import { errorMessage, request } from "../identity/client";

export function ArchiveActivity({
  account,
}: {
  account: AccountResponse;
}): ReactNode {
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
    <section
      className="surface form-card archive-history"
      aria-label="Archived history"
    >
      <p className="step-label">Read only</p>
      <h2>{account.label}</h2>
      <p>
        {kinds[account.kind]} · {ownerLabel(account)}
      </p>
      <p className="archive-balance">
        {account.latestValuation
          ? formatMoney(account.latestValuation.money)
          : "No recorded balance"}
      </p>
      <p className="field-hint">
        {account.latestValuation && (
          <>
            As of {displayDate(account.latestValuation.asOfDate)} ·{" "}
            {account.latestValuation.complete
              ? "Complete recorded value"
              : "Partial recorded value"}
            .{" "}
          </>
        )}
        Recorded value, not a current bank balance.
      </p>
      <Feedback error={error} />
      {loading && <p role="status">Loading archived history…</p>}
      {!loading && !error && !items.length && <p>No archived transactions.</p>}
      <ul className="privacy-activity">
        {items.map((item) => (
          <li key={item.id}>
            <div className="archive-record-description">
              <strong>{item.description}</strong>
              <p>
                <time dateTime={item.bookedDate}>
                  {displayDate(item.bookedDate)}
                </time>{" "}
                · {item.source === "CSV" ? "CSV import" : "Manual record"}
              </p>
            </div>
            <p className="archive-record-amount">{formatMoney(item.money)}</p>
            {item.note.body && (
              <p className="archive-record-note">Your note: {item.note.body}</p>
            )}
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
