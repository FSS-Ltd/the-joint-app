"use client";
import { useEffect, useState, type ReactNode } from "react";
import type { ImportBatchResponse } from "@joint/contracts";
import { useIdentity } from "../identity/use-identity";
import { request, errorMessage } from "../identity/client";
import { Feedback } from "../identity/frame";
import { AccountsFrame } from "../accounts/frame";
import { financePath } from "../finance/http";
import { ImportReview } from "./review";
import { BatchActions } from "./batch-actions";
import { ImportBatchSummary } from "./batch-summary";
import "./imports.css";
import "../finance/finance.css";

export function ImportDetail({ batchId }: { batchId: string }): ReactNode {
  const { identity, loading, error: identityError } = useIdentity();
  const householdId = identity?.membership?.householdId;
  const [batch, setBatch] = useState<ImportBatchResponse | null>(null);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const [dirty, setDirty] = useState(false);
  useEffect(() => {
    if (!householdId) return;
    const currentHousehold = householdId;
    let current = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    async function load() {
      try {
        const result = await request<ImportBatchResponse>(
          financePath(currentHousehold, "imports", batchId),
        );
        if (!current) return;
        setBatch(result);
        setError("");
        if (["QUEUED", "PREVIEWING", "COMMITTING"].includes(result.state))
          timer = setTimeout(() => void load(), 1000);
      } catch (cause) {
        if (current) {
          setBatch(null);
          setError(errorMessage(cause));
        }
      }
    }
    void load();
    return () => {
      current = false;
      if (timer) clearTimeout(timer);
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
      {(loading || (householdId && !batch && !error)) && (
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
              saved={setBatch}
              onDirty={setDirty}
            />
          )}
          <BatchActions
            key={`${batch.id}-${batch.version}`}
            householdId={householdId}
            batch={batch}
            dirty={dirty}
            saved={(next) => {
              setBatch(next);
              setRevision((value) => value + 1);
            }}
          />
        </div>
      )}
    </AccountsFrame>
  );
}
