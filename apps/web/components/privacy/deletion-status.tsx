"use client";
import { useEffect, useState, type ReactNode } from "react";
import { idempotencyKeySchema, type DeletionStatus } from "@joint/contracts";
import { IdentityFrame, Feedback } from "../identity/frame";
import { errorMessage, request } from "../identity/client";

export function DeletionReceiptPage(): ReactNode {
  const [status, setStatus] = useState<DeletionStatus | null>(null);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let current = true;
    let timeout: ReturnType<typeof setTimeout>;
    const id = new URLSearchParams(window.location.search).get("id");
    if (!idempotencyKeySchema.safeParse(id).success) {
      setError("This deletion receipt is unavailable.");
      return;
    }
    async function load() {
      try {
        const result = await request<DeletionStatus>(
          `/api/privacy/deletion-requests/${id}`,
        );
        if (!current) return;
        setStatus(result);
        setError("");
        if (result.state !== "COMPLETED")
          timeout = setTimeout(() => void load(), 5000);
      } catch (cause) {
        if (current) setError(errorMessage(cause));
      }
    }
    void load();
    return () => {
      current = false;
      clearTimeout(timeout);
    };
  }, [revision]);
  return (
    <IdentityFrame
      eyebrow="Privacy receipt"
      title="Your deletion request."
      description="A private status receipt for this browser."
    >
      <section className="surface form-card">
        <h2>Deletion status</h2>
        <Feedback error={error} />
        {!status && !error && <p role="status">Checking request…</p>}
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
