"use client";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { TransactionResponse } from "@joint/contracts";
import { formatMoney } from "@joint/domain";
import { request, errorMessage } from "../identity/client";
import { Feedback } from "../identity/frame";
import { financePath } from "../finance/http";
import { KindOptions, kindLabels } from "./kinds";
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
  const generation = useRef(0);
  const [filters, setFilters] = useState({
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
      <form
        className="surface form-card form-stack"
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          setFilters({
            month: String(f.get("month") ?? ""),
            search: String(f.get("search") ?? "").trim(),
            category: String(f.get("category") ?? "").trim(),
            classificationKind: String(f.get("classificationKind") ?? ""),
            uncategorized: f.get("uncategorized") === "on",
          });
        }}
      >
        <h3>Find activity</h3>
        <label>
          Month
          <input
            type="month"
            name="month"
            defaultValue={filters.month}
            key={filters.month}
          />
        </label>
        <label>
          Search description
          <input name="search" maxLength={100} defaultValue={filters.search} />
        </label>
        <label>
          Category
          <input
            name="category"
            maxLength={80}
            defaultValue={filters.category}
          />
        </label>
        <label>
          Financial type
          <select
            name="classificationKind"
            defaultValue={filters.classificationKind}
          >
            <option value="">All financial types</option>
            <KindOptions />
          </select>
        </label>
        <label className="check-line">
          <input
            type="checkbox"
            name="uncategorized"
            defaultChecked={filters.uncategorized}
          />
          Uncategorized only
        </label>
        <button className="button secondary" type="submit" disabled={pending}>
          Apply activity filters
        </button>
      </form>
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
                {((!item.splits.length && item.category) || item.merchant) && (
                  <p>
                    {[item.splits.length ? null : item.category, item.merchant]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                )}
              </div>
              <p>
                {item.splits.length
                  ? `Split transaction · ${item.splits.length} components`
                  : `${kindLabels[item.effectiveKind ?? "UNCLASSIFIED"]} · ${item.classificationConfirmed ? "Reviewed" : "Unreviewed"}`}
              </p>
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
