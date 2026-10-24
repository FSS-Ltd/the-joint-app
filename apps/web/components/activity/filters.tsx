import type { ReactNode } from "react";
import { KindOptions } from "./kinds";

export interface ActivityFilterValues {
  month: string;
  search: string;
  category: string;
  classificationKind: string;
  uncategorized: boolean;
}

export function ActivityFilters({
  filters,
  pending,
  onApply,
}: {
  filters: ActivityFilterValues;
  pending: boolean;
  onApply: (filters: ActivityFilterValues) => void;
}): ReactNode {
  const additionalCount = [
    filters.month,
    filters.category,
    filters.classificationKind,
    filters.uncategorized,
  ].filter(Boolean).length;
  return (
    <form
      className="surface activity-filters"
      aria-label="Find activity"
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        onApply({
          month: String(data.get("month") ?? ""),
          search: String(data.get("search") ?? "").trim(),
          category: String(data.get("category") ?? "").trim(),
          classificationKind: String(data.get("classificationKind") ?? ""),
          uncategorized: data.get("uncategorized") === "on",
        });
      }}
    >
      <label>
        Search description
        <input
          key={filters.search}
          type="search"
          name="search"
          maxLength={100}
          defaultValue={filters.search}
          placeholder="Find a transaction"
        />
      </label>
      <details className="activity-more-filters">
        <summary>
          <span>More filters</span>
          {additionalCount > 0 && (
            <span className="finance-badge">{additionalCount} active</span>
          )}
        </summary>
        <div className="activity-filter-fields">
          <label>
            Month
            <input
              key={filters.month}
              type="month"
              name="month"
              defaultValue={filters.month}
            />
          </label>
          <label>
            Category
            <input
              key={filters.category}
              name="category"
              maxLength={80}
              defaultValue={filters.category}
            />
          </label>
          <label>
            Financial type
            <select
              key={filters.classificationKind}
              name="classificationKind"
              defaultValue={filters.classificationKind}
            >
              <option value="">All financial types</option>
              <KindOptions />
            </select>
          </label>
          <label className="check-line">
            <input
              key={String(filters.uncategorized)}
              type="checkbox"
              name="uncategorized"
              defaultChecked={filters.uncategorized}
            />
            Uncategorized only
          </label>
        </div>
      </details>
      <button className="button secondary" type="submit" disabled={pending}>
        Apply activity filters
      </button>
    </form>
  );
}
