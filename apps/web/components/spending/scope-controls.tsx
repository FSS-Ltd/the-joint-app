"use client";
import type { ReactNode } from "react";
import type { ReportState } from "./use-report";
export function ReportScope({ state }: { state: ReportState }): ReactNode {
  return (
    <section className="surface report-scope" aria-label="Report scope">
      <label>
        Calendar month
        <input
          type="month"
          value={state.month}
          required
          onChange={(e) => {
            if (e.target.value) state.setMonth(e.target.value);
          }}
        />
      </label>
      <details>
        <summary>
          Accounts included ·{" "}
          {state.selected === null
            ? "All available"
            : `${state.selected.length} selected`}
        </summary>
        <p className="field-hint">
          Choose one to fifty accounts with Values and details access. Selecting
          a different set creates a separate budget.
        </p>
        <label className="check-line">
          <input
            type="checkbox"
            checked={state.selected === null}
            onChange={() =>
              state.setSelected(
                state.selected === null
                  ? state.accounts.map((a) => a.id)
                  : null,
              )
            }
          />
          All available accounts
        </label>
        {state.accounts.map((a) => (
          <label className="check-line" key={a.id}>
            <input
              type="checkbox"
              checked={state.selected === null || state.selected.includes(a.id)}
              onChange={(e) => {
                const ids = state.selected ?? state.accounts.map((v) => v.id);
                const next = e.target.checked
                  ? [...new Set([...ids, a.id])]
                  : ids.filter((id) => id !== a.id);
                state.setSelected(next);
              }}
            />
            {a.label} · {a.ownership === "OWNED" ? "Yours" : "Shared with you"}
          </label>
        ))}
        {state.more && (
          <button
            className="text-button"
            type="button"
            onClick={() => void state.loadMore()}
          >
            Load more accounts
          </button>
        )}
      </details>
      <button
        className="button secondary"
        type="button"
        onClick={state.refresh}
        disabled={state.pending}
      >
        Refresh report
      </button>
    </section>
  );
}
