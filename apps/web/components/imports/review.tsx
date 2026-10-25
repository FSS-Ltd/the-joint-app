"use client";
import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type Dispatch,
  type SetStateAction,
} from "react";
import {
  importRowsQuerySchema,
  type ImportBatchResponse,
  type NormalizedCsvRow,
} from "@joint/contracts";
import { request, errorMessage } from "../identity/client";
import { Feedback } from "../identity/frame";
import { financePath } from "../finance/http";
import { ReviewRow } from "./review-row";

type ReviewChoices = Record<number, "KEEP" | "SKIP">;
type ReviewFilter = ReturnType<typeof importRowsQuerySchema.parse>["filter"];
export interface ImportReviewDraft {
  version: number;
  filter: ReviewFilter;
  offset: number;
  choices: ReviewChoices;
}
const emptyChoices: ReviewChoices = Object.freeze({});

export function ImportReview({
  householdId,
  batch,
  saved,
  draft,
  onDraft,
}: {
  householdId: string;
  batch: ImportBatchResponse;
  saved: (batch: ImportBatchResponse) => void;
  draft: ImportReviewDraft | null;
  onDraft: Dispatch<SetStateAction<ImportReviewDraft | null>>;
}): ReactNode {
  const restored = draft?.version === batch.version ? draft : null;
  const [filter, setFilter] = useState<ReviewFilter>(restored?.filter ?? "ALL");
  const [offset, setOffset] = useState(restored?.offset ?? 0);
  const [rows, setRows] = useState<NormalizedCsvRow[]>([]);
  const [next, setNext] = useState<number | null>(null);
  const choices = restored?.choices ?? emptyChoices;
  function setChoices(action: SetStateAction<ReviewChoices>): void {
    onDraft((current) => {
      if (current && current.version > batch.version) return current;
      return {
        version: batch.version,
        filter,
        offset,
        choices:
          typeof action === "function"
            ? action(
                current?.version === batch.version
                  ? current.choices
                  : emptyChoices,
              )
            : action,
      };
    });
  }
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const editable = batch.state === "READY";
  const scope = JSON.stringify([
    householdId,
    batch.id,
    batch.version,
    offset,
    filter,
  ]);
  const previousScope = useRef(scope);
  useEffect(() => {
    let current = true;
    setPending(true);
    setRows([]);
    if (previousScope.current !== scope) setChoices({});
    previousScope.current = scope;
    setError("");
    const query = new URLSearchParams({
      offset: String(offset),
      limit: "100",
      filter,
    });
    void request<{ items: NormalizedCsvRow[]; nextOffset: number | null }>(
      `${financePath(householdId, "imports", batch.id)}/rows?${query}`,
    )
      .then((result) => {
        if (current) {
          setRows(result.items);
          setNext(result.nextOffset);
        }
      })
      .catch((cause) => {
        if (current) setError(errorMessage(cause));
      })
      .finally(() => {
        if (current) setPending(false);
      });
    return () => {
      current = false;
    };
  }, [householdId, batch.id, batch.version, offset, filter, revision]);
  async function save() {
    setPending(true);
    setError("");
    try {
      const result = await request<ImportBatchResponse>(
        `${financePath(householdId, "imports", batch.id)}/review`,
        {
          decisions: Object.entries(choices).map(([rowNumber, decision]) => ({
            rowNumber: Number(rowNumber),
            decision,
          })),
        },
        undefined,
        { method: "PATCH", ifMatch: batch.version },
      );
      saved(result);
      setChoices({});
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setPending(false);
    }
  }
  return (
    <section
      className="finance-stack import-source-review"
      aria-label="Source row review"
    >
      <div className="finance-section-title">
        <h2>Source rows</h2>
        <label>
          Show rows
          <select
            value={filter}
            disabled={pending || Object.keys(choices).length > 0}
            onChange={(event) => {
              const nextFilter = importRowsQuerySchema.shape.filter.safeParse(
                event.target.value,
              );
              if (!nextFilter.success) return;
              setFilter(nextFilter.data);
              setOffset(0);
            }}
          >
            <option value="ALL">All rows</option>
            <option value="REVIEW">Needs review</option>
            <option value="REJECTED">Rejected</option>
          </select>
        </label>
      </div>
      <p>
        Similar purchases can be separate transactions. Choose Keep or Skip for
        each possible overlap before committing. Nothing is removed just because
        its date, description and amount match.
      </p>
      <Feedback error={error} />
      {error && (
        <button
          className="button secondary"
          type="button"
          onClick={() => setRevision((value) => value + 1)}
        >
          Reload rows
        </button>
      )}
      {pending && <p role="status">Loading or saving rows…</p>}
      {!pending && !error && !rows.length && (
        <p className="finance-empty">No rows in this view.</p>
      )}
      <ol className="import-review-list">
        {rows.map((row) => (
          <ReviewRow
            key={row.rowNumber}
            row={row}
            editable={editable}
            pending={pending}
            choice={choices[row.rowNumber]}
            onChoose={(decision) =>
              setChoices((previous) => ({
                ...previous,
                [row.rowNumber]: decision,
              }))
            }
          />
        ))}
      </ol>
      {editable && (
        <button
          className="button primary"
          disabled={pending || Boolean(error) || !Object.keys(choices).length}
          type="button"
          onClick={() => void save()}
        >
          Save row choices
        </button>
      )}
      <div className="finance-pagination">
        <button
          className="button secondary"
          disabled={pending || offset === 0 || Object.keys(choices).length > 0}
          type="button"
          onClick={() => setOffset((value) => Math.max(0, value - 100))}
        >
          Previous 100 rows
        </button>
        {next !== null && (
          <button
            className="button secondary"
            disabled={pending || Object.keys(choices).length > 0}
            type="button"
            onClick={() => setOffset(next)}
          >
            Next 100 rows
          </button>
        )}
      </div>
      {Object.keys(choices).length > 0 && (
        <p role="status">
          Save your row choices before changing pages or committing.
        </p>
      )}
    </section>
  );
}
