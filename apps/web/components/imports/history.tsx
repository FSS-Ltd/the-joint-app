"use client";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import type { ImportBatchResponse } from "@joint/contracts";
import { errorMessage, request } from "../identity/client";
import { Feedback } from "../identity/frame";
import { financePath } from "../finance/http";
import { importStateLabel } from "./presentation";

export function ImportHistory({
  householdId,
  accountId,
}: {
  householdId: string;
  accountId: string;
}): ReactNode {
  const [items, setItems] = useState<ImportBatchResponse[]>([]);
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
          items: ImportBatchResponse[];
          nextCursor: string | null;
        }>(`${financePath(householdId, "imports")}?${query}`);
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
  }, [load]);
  return (
    <section
      className="import-history finance-stack"
      aria-labelledby="import-history-title"
    >
      <div className="finance-section-title">
        <div>
          <h2 id="import-history-title">Import history</h2>
          {!pending && !error && (
            <p className="field-hint">
              {items.length} {items.length === 1 ? "import" : "imports"} loaded
            </p>
          )}
        </div>
        <button
          className="text-button"
          disabled={pending}
          type="button"
          onClick={() => void load()}
        >
          Refresh imports
        </button>
      </div>
      <Feedback error={error} />
      {pending && <p role="status">Loading imports…</p>}
      {!pending && !error && !items.length && (
        <p className="field-hint">No imports for this account yet.</p>
      )}
      <ul className="surface finance-list">
        {items.map((batch) => (
          <li key={batch.id}>
            <div className="finance-row">
              <div>
                <h3>
                  <a href={`/imports/${batch.id}?account=${accountId}`}>
                    {importStateLabel(batch.state)}
                  </a>
                </h3>
                <p>
                  CSV · Created{" "}
                  <time dateTime={batch.createdAt}>
                    {new Date(batch.createdAt).toLocaleDateString("en-GB")}
                  </time>
                </p>
              </div>
              <span className="finance-badge">
                {batch.state === "COMMITTED"
                  ? `${batch.committedRows} imported`
                  : `${batch.totalRows} source rows`}
              </span>
            </div>
          </li>
        ))}
      </ul>
      {cursor && (
        <button
          className="button secondary"
          disabled={pending}
          type="button"
          onClick={() => void load(cursor)}
        >
          Load more imports
        </button>
      )}
    </section>
  );
}
