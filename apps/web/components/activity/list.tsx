"use client";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import type { TransactionResponse } from "@joint/contracts";
import { formatMoney } from "@joint/domain";
import { request, errorMessage } from "../identity/client";
import { Feedback } from "../identity/frame";
import { financePath } from "../finance/http";
import { displayDate } from "../accounts/presentation";

export function ActivityList({
  householdId,
  accountId,
  revision,
}: {
  householdId: string;
  accountId: string;
  revision: number;
}): ReactNode {
  const [items, setItems] = useState<TransactionResponse[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const load = useCallback(
    async (next?: string) => {
      setPending(true);
      setError("");
      if (!next) setItems([]);
      try {
        const query = new URLSearchParams({ accountId, limit: "50" });
        if (next) query.set("cursor", next);
        const result = await request<{
          items: TransactionResponse[];
          nextCursor: string | null;
        }>(`${financePath(householdId, "transactions")}?${query}`);
        setItems((previous) =>
          next ? [...previous, ...result.items] : result.items,
        );
        setCursor(result.nextCursor);
      } catch (cause) {
        setItems([]);
        setCursor(null);
        setError(errorMessage(cause));
      } finally {
        setPending(false);
      }
    },
    [householdId, accountId],
  );
  useEffect(() => {
    void load();
  }, [load, revision]);
  return (
    <section className="finance-stack">
      <div className="finance-section-title">
        <h2>Booked activity</h2>
        <button
          className="text-button"
          type="button"
          disabled={pending}
          onClick={() => void load()}
        >
          Refresh activity
        </button>
      </div>
      <Feedback error={error} />
      {pending && <p role="status">Loading activity…</p>}
      {!pending && !items.length && !error && (
        <div className="surface finance-empty">
          <h3>No activity yet</h3>
          <p>Manual entries and completed CSV imports will appear here.</p>
        </div>
      )}
      <ul className="surface finance-list">
        {items.map((item) => (
          <li key={item.id}>
            <a
              className="finance-row activity-link"
              href={`/activity/${item.id}`}
            >
              <div>
                <h3>{item.description}</h3>
                <p>
                  <time dateTime={item.bookedDate}>
                    {displayDate(item.bookedDate)}
                  </time>{" "}
                  · {item.source === "MANUAL" ? "Manual entry" : "CSV import"}
                </p>
                {(item.category || item.merchant) && (
                  <p>
                    {[item.category, item.merchant].filter(Boolean).join(" · ")}
                  </p>
                )}
              </div>
              <strong className="finance-amount">
                {formatMoney(item.money)}
                <span aria-hidden="true"> ↗</span>
              </strong>
            </a>
          </li>
        ))}
      </ul>
      {cursor && (
        <button
          className="button secondary"
          type="button"
          disabled={pending}
          onClick={() => void load(cursor)}
        >
          Load more activity
        </button>
      )}
    </section>
  );
}
