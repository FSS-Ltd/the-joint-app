"use client";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { TransactionResponse } from "@joint/contracts";
import { request, errorMessage } from "../identity/client";
import { Feedback } from "../identity/frame";
import { financePath } from "../finance/http";
import { ActivityFilters, type ActivityFilterValues } from "./filters";
import { ActivityRow } from "./row";

export function ActivityList({
  householdId,
  accountId,
  revision,
}: {
  householdId: string;
  accountId: string;
  revision: number;
}): ReactNode {
  const generation = useRef(0);
  const [filters, setFilters] = useState<ActivityFilterValues>({
    month: "",
    search: "",
    category: "",
    classificationKind: "",
    uncategorized: false,
  });
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    setFilters({
      month: p.get("month") ?? "",
      search: p.get("search") ?? "",
      category: p.get("category") ?? "",
      classificationKind: p.get("classificationKind") ?? "",
      uncategorized: p.get("uncategorized") === "true",
    });
  }, []);
  const [items, setItems] = useState<TransactionResponse[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const load = useCallback(
    async (next?: string) => {
      const current = ++generation.current;
      setPending(true);
      setError("");
      if (!next) setItems([]);
      try {
        const query = new URLSearchParams({ accountId, limit: "50" });
        for (const [key, value] of Object.entries(filters)) {
          if (value) query.set(key, String(value));
        }
        if (next) query.set("cursor", next);
        const result = await request<{
          items: TransactionResponse[];
          nextCursor: string | null;
        }>(`${financePath(householdId, "transactions")}?${query}`);
        if (current !== generation.current) return;
        setItems((previous) =>
          next ? [...previous, ...result.items] : result.items,
        );
        setCursor(result.nextCursor);
      } catch (cause) {
        if (current !== generation.current) return;
        setItems([]);
        setCursor(null);
        setError(errorMessage(cause));
      } finally {
        if (current === generation.current) setPending(false);
      }
    },
    [householdId, accountId, filters],
  );
  useEffect(() => {
    void load();
    return () => {
      generation.current++;
    };
  }, [load, revision]);
  useEffect(() => {
    const focus = () => void load();
    window.addEventListener("focus", focus);
    return () => window.removeEventListener("focus", focus);
  }, [load]);
  return (
    <section
      className="activity-ledger finance-stack"
      aria-labelledby="booked-activity-title"
    >
      <div className="finance-section-title">
        <div>
          <h2 id="booked-activity-title">Booked activity</h2>
          {!pending && !error && (
            <p className="activity-loaded-count">
              <span>
                {items.length} {items.length === 1 ? "record" : "records"}{" "}
                loaded
              </span>
              {cursor ? " · More activity available" : ""}
            </p>
          )}
        </div>
        <button
          className="text-button"
          type="button"
          disabled={pending}
          onClick={() => void load()}
        >
          Refresh activity
        </button>
      </div>
      <ActivityFilters
        filters={filters}
        pending={pending}
        onApply={setFilters}
      />
      <Feedback error={error} />
      {pending && <p role="status">Loading activity…</p>}
      {!pending && !items.length && !error && (
        <div className="surface finance-empty">
          <h3>No activity yet</h3>
          <p>Manual entries and completed CSV imports will appear here.</p>
        </div>
      )}
      {items.length > 0 && (
        <div className="activity-ledger-frame">
          <ul className="activity-rows">
            {items.map((transaction) => (
              <ActivityRow key={transaction.id} transaction={transaction} />
            ))}
          </ul>
        </div>
      )}
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
