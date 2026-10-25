"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { ImportBatchResponse } from "@joint/contracts";
import { useIdentity } from "../identity/use-identity";
import { request, errorMessage } from "../identity/client";
import { watchStatusResource } from "../events/status-subscription";
import { Feedback } from "../identity/frame";
import { AccountsFrame } from "../accounts/frame";
import { financePath } from "../finance/http";
import { ImportReview, type ImportReviewDraft } from "./review";
import { BatchActions } from "./batch-actions";
import { ImportBatchSummary } from "./batch-summary";
import "./imports.css";
import "../finance/finance.css";

export function ImportDetail({ batchId }: { batchId: string }): ReactNode {
  const viewer = useIdentity();
  const scope = `${viewer.identity?.user.id ?? ""}:${viewer.identity?.membership?.householdId ?? ""}:${batchId}`;
  return <ScopedImportDetail key={scope} batchId={batchId} viewer={viewer} />;
}

function ScopedImportDetail({
  batchId,
  viewer,
}: {
  batchId: string;
  viewer: ReturnType<typeof useIdentity>;
}): ReactNode {
  const { identity, loading, error: identityError } = viewer;
  const householdId = identity?.membership?.householdId;
  const [resource, setResource] = useState<{
    batch: ImportBatchResponse;
    epoch: number;
  } | null>(null);
  const batch = resource?.batch ?? null;
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const [draft, setDraft] = useState<ImportReviewDraft | null>(null);
  const [reconnecting, setReconnecting] = useState(false);
  const authority = useRef(0);
  const operationEpoch = resource?.epoch;
  const dirty = Boolean(
    batch &&
    draft?.version === batch.version &&
    Object.keys(draft.choices).length,
  );
  function saveMutation(next: ImportBatchResponse): void {
    if (operationEpoch === authority.current) saveBatch(next);
  }
  function saveBatch(next: ImportBatchResponse): void {
    const epoch = authority.current;
    setDraft((current) =>
      current && current.version < next.version ? null : current,
    );
    setResource((current) =>
      current &&
      current.batch.id === next.id &&
      current.batch.version > next.version
        ? current
        : { batch: next, epoch },
    );
  }
  useEffect(() => {
    authority.current++;
    setResource(null);
    setError("");
    setReconnecting(false);
    if (!householdId) return;
    const stop = watchStatusResource({
      selector: { kind: "import", householdId, id: batchId },
      read: (signal) =>
        request<ImportBatchResponse>(
          financePath(householdId, "imports", batchId),
          undefined,
          undefined,
          { signal },
        ),
      receive: (result) => {
        saveBatch(result);
        setError("");
        setReconnecting(false);
      },
      unavailable: (cause) => {
        authority.current++;
        setResource(null);
        setError(cause ? errorMessage(cause) : "");
        setReconnecting(true);
      },
      failure: (cause) => {
        setDraft(null);
        setResource(null);
        setReconnecting(false);
        setError(errorMessage(cause));
      },
    });
    return () => {
      authority.current++;
      stop();
    };
  }, [householdId, batchId, revision]);
  return (
    <AccountsFrame
      active="imports"
      title="Your import"
      description="Review the source. Keep what belongs. Every change stays traceable."
      household={identity?.membership?.household.name}
    >
      <a
        className="form-link account-back"
        href={batch ? `/imports?account=${batch.accountId}` : "/imports"}
      >
        Back to imports
      </a>
      <Feedback error={identityError || error} />
      {error && (
        <button
          className="button secondary"
          type="button"
          onClick={() => setRevision((value) => value + 1)}
        >
          Retry import status
        </button>
      )}
      {reconnecting && (
        <p role="status">Reconnecting to live import updates…</p>
      )}
      {(loading || (householdId && !batch && !error && !reconnecting)) && (
        <p role="status">Loading import…</p>
      )}
      {identity && !loading && !householdId && (
        <a className="button secondary" href="/household">
          Go to household
        </a>
      )}
      {batch && householdId && (
        <div className="finance-stack import-workspace">
          <ImportBatchSummary
            batch={batch}
            dirty={dirty}
            refresh={() => setRevision((value) => value + 1)}
          />
          {["READY", "COMMITTED", "ROLLED_BACK"].includes(batch.state) && (
            <ImportReview
              householdId={householdId}
              batch={batch}
              saved={saveMutation}
              draft={draft}
              onDraft={(action) => {
                if (operationEpoch === authority.current) setDraft(action);
              }}
            />
          )}
          <BatchActions
            key={`${batch.id}-${batch.version}`}
            householdId={householdId}
            batch={batch}
            dirty={dirty}
            saved={(next) => {
              if (operationEpoch !== authority.current) return;
              saveMutation(next);
              setRevision((value) => value + 1);
            }}
          />
        </div>
      )}
    </AccountsFrame>
  );
}
