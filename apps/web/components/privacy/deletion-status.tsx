"use client";
import { useEffect, useState, type ReactNode } from "react";
import { idempotencyKeySchema, type DeletionStatus } from "@joint/contracts";
import { watchStatusResource } from "../events/status-subscription";
import { IdentityFrame, Feedback } from "../identity/frame";
import { errorMessage, request } from "../identity/client";

export function DeletionReceiptPage({ id }: { id: string | null }): ReactNode {
  const [status, setStatus] = useState<DeletionStatus | null>(null);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const [reconnecting, setReconnecting] = useState(false);
  useEffect(() => {
    setStatus(null);
    setError("");
    setReconnecting(false);
    const parsed = idempotencyKeySchema.safeParse(id);
    if (!parsed.success) {
      setError("This deletion receipt is unavailable.");
      return;
    }
    const receiptId = parsed.data;
    return watchStatusResource({
      selector: { kind: "deletion", id: receiptId },
      read: (signal) =>
        request<DeletionStatus>(
          `/api/privacy/deletion-requests/${receiptId}`,
          undefined,
          undefined,
          { signal },
        ),
      receive: (result) => {
        setStatus(result);
        setError("");
        setReconnecting(false);
      },
      unavailable: (cause) => {
        setStatus(null);
        setError(cause ? errorMessage(cause) : "");
        setReconnecting(true);
      },
      failure: (cause) => {
        setStatus(null);
        setReconnecting(false);
        setError(errorMessage(cause));
      },
    });
  }, [id, revision]);
  return (
    <IdentityFrame
      eyebrow="Privacy receipt"
      title="Your deletion request."
      description="A private status receipt for this browser."
    >
      <section className="surface form-card">
        <h2>Deletion status</h2>
        <Feedback error={error} />
        {reconnecting && <p role="status">Reconnecting to receipt updates…</p>}
        {!status && !error && !reconnecting && (
          <p role="status">Checking request…</p>
        )}
        {status && (
          <p role="status">
            {status.state === "COMPLETED"
              ? "Deletion completed."
              : status.state === "PROVIDER_PENDING"
                ? "App access has ended. Provider cleanup is still pending."
                : "Your deletion request is being processed. App access has ended."}
          </p>
        )}
        <p>
          This page contains no financial information. Your receipt expires and
          is available only in the browser that requested deletion.
        </p>
        <button
          className="button secondary"
          onClick={() => setRevision((old) => old + 1)}
        >
          Check status again
        </button>
      </section>
    </IdentityFrame>
  );
}
