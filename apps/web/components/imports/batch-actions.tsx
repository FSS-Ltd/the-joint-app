"use client";
import { useState, type ReactNode } from "react";
import {
  importBatchSchema,
  type ImportBatchResponse,
  importJobResultSchema,
} from "@joint/contracts";
import { errorMessage, request } from "../identity/client";
import { Feedback } from "../identity/frame";
import { financePath, removeRecord } from "../finance/http";

export function BatchActions({
  householdId,
  batch,
  saved,
  dirty,
}: {
  householdId: string;
  batch: ImportBatchResponse;
  saved: (batch: ImportBatchResponse) => void;
  dirty: boolean;
}): ReactNode {
  const [acknowledged, setAcknowledged] = useState(false);
  const [key, setKey] = useState("");
  const [confirm, setConfirm] = useState<"rollback" | "original" | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  async function commit() {
    setError("");
    setPending(true);
    const stableKey = key || crypto.randomUUID();
    setKey(stableKey);
    try {
      const result = await request<
        ReturnType<typeof importJobResultSchema.parse>
      >(
        `${financePath(householdId, "imports", batch.id)}/commit`,
        { acceptRejectedRows: acknowledged },
        stableKey,
        { ifMatch: batch.version },
      );
      saved(result.batch);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setPending(false);
    }
  }
  async function remove() {
    if (!confirm) return;
    setPending(true);
    setError("");
    try {
      saved(
        await removeRecord(
          `${financePath(householdId, "imports", batch.id)}${confirm === "original" ? "/original" : ""}`,
          importBatchSchema,
          batch.version,
        ),
      );
      setConfirm(null);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setPending(false);
    }
  }
  return (
    <section className="surface form-card finance-stack">
      <h2>Import controls</h2>
      <Feedback error={error} />
      {dirty && <p role="status">Save row choices before committing.</p>}
      {(batch.permissions.canCommit || batch.permissions.canRestore) && (
        <>
          {batch.rejectedRows > 0 && (
            <label className="finance-checkbox">
              <input
                type="checkbox"
                checked={acknowledged}
                disabled={pending}
                onChange={(event) => {
                  setAcknowledged(event.target.checked);
                  setKey("");
                }}
              />
              I understand that {batch.rejectedRows} rejected{" "}
              {batch.rejectedRows === 1 ? "row" : "rows"} will not be imported.
            </label>
          )}
          <p>
            {batch.permissions.canRestore
              ? "Restore the same committed rows. Their identities remain the same; this does not create copies."
              : "Only kept, valid rows will enter activity. Rows remain invisible there until the complete import succeeds."}
          </p>
          <button
            className="button primary"
            type="button"
            disabled={
              pending || dirty || (batch.rejectedRows > 0 && !acknowledged)
            }
            onClick={() => void commit()}
          >
            {pending
              ? "Queueing…"
              : batch.permissions.canRestore
                ? "Restore import"
                : "Commit import"}
          </button>
        </>
      )}
      {batch.permissions.canRollback && (
        <>
          <p>
            Rollback removes this import’s transactions together. It is blocked
            if any imported transaction has later corrections, classification
            changes or notes.
          </p>
          <button
            className="button secondary"
            disabled={pending}
            type="button"
            onClick={() => setConfirm("rollback")}
          >
            Roll back import
          </button>
        </>
      )}
      {batch.state === "COMMITTED" && !batch.permissions.canRollback && (
        <p className="finance-warning">
          Later changes or notes protect this import from rollback.
        </p>
      )}
      {batch.originalAvailable ? (
        <>
          <p className="field-hint">
            Original CSV retained until{" "}
            {batch.originalExpiresAt
              ? new Date(batch.originalExpiresAt).toLocaleString("en-GB")
              : "its retention deadline"}
            . Normalized records remain after original deletion.
          </p>
          {batch.permissions.canDeleteOriginal && (
            <button
              className="text-button"
              disabled={pending}
              type="button"
              onClick={() => setConfirm("original")}
            >
              Delete original CSV now
            </button>
          )}
        </>
      ) : (
        <p className="field-hint">
          The original CSV is no longer retained. Normalized records and import
          history remain.
        </p>
      )}
      {confirm && (
        <div className="finance-confirm">
          <h3>
            {confirm === "rollback"
              ? "Roll back this import?"
              : "Permanently delete the original CSV?"}
          </h3>
          <p>
            {confirm === "rollback"
              ? "All unchanged transactions from this import will leave activity. You can restore the same rows later."
              : "The original file cannot be recovered. Imported transactions and review records will remain."}
          </p>
          <div className="finance-actions">
            <button
              className="button primary"
              disabled={pending}
              type="button"
              onClick={() => void remove()}
            >
              {pending
                ? "Working…"
                : confirm === "rollback"
                  ? "Confirm rollback"
                  : "Delete original permanently"}
            </button>
            <button
              className="button secondary"
              disabled={pending}
              type="button"
              onClick={() => setConfirm(null)}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
