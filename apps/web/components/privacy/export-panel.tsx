"use client";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import type { AccountResponse, ExportStatus } from "@joint/contracts";
import { useExportJob, type ExportStatusScope } from "./use-export-job";
import { Feedback } from "../identity/frame";

const stateLabels: Record<ExportStatus["state"], string> = {
  QUEUED: "Your export is queued.",
  PROCESSING: "Preparing your export…",
  READY: "Your export is ready.",
  INVALIDATED:
    "Access changed. Request a new export with your current account access.",
  EXPIRED: "This export expired. Request a new export.",
  FAILED: "This export failed. Try requesting it again.",
};
export function ExportPanel({
  accounts,
  path,
  refreshing,
  scopeError,
  actor,
  onAccessChanged,
  streamScope,
}: {
  accounts: AccountResponse[];
  path: string;
  refreshing: boolean;
  scopeError: boolean;
  actor: string;
  onAccessChanged: () => void;
  streamScope: ExportStatusScope;
}): ReactNode {
  const {
    selected,
    choose,
    job,
    pending,
    error,
    mfa,
    tracking,
    retryable,
    retryStatus,
    submit: requestExport,
  } = useExportJob({
    accounts,
    path,
    actor,
    refreshing,
    scopeError,
    onAccessChanged,
    streamScope,
  });
  const unavailable = refreshing || scopeError;
  const [downloadMfa, setDownloadMfa] = useState(false);
  const [downloadError, setDownloadError] = useState(false);
  useEffect(() => {
    setDownloadMfa(
      new URLSearchParams(window.location.search).get("export") === "mfa",
    );
    setDownloadError(
      new URLSearchParams(window.location.search).get("export") ===
        "unavailable",
    );
  }, []);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setDownloadMfa(false);
    setDownloadError(false);
    await requestExport();
  }
  const busy =
    pending ||
    tracking ||
    job?.state === "QUEUED" ||
    job?.state === "PROCESSING";
  return (
    <div
      className="privacy-export-frame"
      role="region"
      aria-label="Export scope"
    >
      <section className="surface form-card" aria-labelledby="export-heading">
        <p className="step-label">Keep a copy</p>
        <h2 id="export-heading">Export your data</h2>
        <p>
          Choose up to 50 accounts. Values only includes account details and
          balances. Values and details also includes transaction history and
          your own private notes.
        </p>
        <p>
          Exports respect your access at download time. Another person’s private
          notes are never included.
        </p>
        <Feedback
          error={
            error ||
            (downloadError
              ? "This download is unavailable or expired, or your access changed. Refresh your accounts and request a new export."
              : downloadMfa
                ? "Verify a fresh authenticator code in Account security, then try again."
                : "")
          }
        />
        {tracking && <p role="status">Checking live export status…</p>}
        {retryable && (
          <button
            className="button secondary"
            type="button"
            onClick={retryStatus}
          >
            Retry export status
          </button>
        )}
        {(mfa || downloadMfa) && (
          <a
            href={`/security?next=${path === "/api/me/archive/exports" ? "archive" : "privacy"}&reauth=1`}
          >
            Verify a fresh authenticator code
          </a>
        )}
        <p className="privacy-scope-count">
          {accounts.length} loaded{" "}
          {accounts.length === 1 ? "account" : "accounts"} · {selected.length}{" "}
          selected
        </p>
        <form className="form-stack" onSubmit={submit} aria-busy={busy}>
          <fieldset className="privacy-accounts" disabled={busy || unavailable}>
            <legend>Accounts to export</legend>
            {accounts.length === 0 && <p>No accounts available to export.</p>}
            {accounts.map((account) => (
              <label key={account.id} className="privacy-choice">
                <input
                  type="checkbox"
                  checked={selected.includes(account.id)}
                  disabled={
                    !selected.includes(account.id) && selected.length >= 50
                  }
                  onChange={(event) => choose(account.id, event.target.checked)}
                />
                <span>
                  {account.label}
                  <small>
                    {account.access === "TOTALS"
                      ? "Values only · balances and account details"
                      : "Values and details · history and your notes"}
                  </small>
                </span>
              </label>
            ))}
          </fieldset>
          <button
            className="button primary"
            type="submit"
            disabled={busy || unavailable || selected.length === 0}
          >
            {busy ? "Preparing export…" : "Request CSV export"}
          </button>
        </form>
        {job && (
          <div className="privacy-export-status" role="status">
            <p>{stateLabels[job.state]}</p>
            {job.state === "READY" && (
              <>
                <p className="field-hint">
                  Download before{" "}
                  {new Date(
                    job.downloadExpiresAt ?? job.expiresAt,
                  ).toLocaleString("en-GB")}
                  . Access is checked again when you download.
                </p>
                <a
                  className="button secondary"
                  href={`${path}/${job.id}/download`}
                >
                  Download CSV
                </a>
              </>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
