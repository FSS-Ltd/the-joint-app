import { useEffect, useRef, useState } from "react";
import type { AccountResponse, ExportStatus } from "@joint/contracts";
import { NativeApiError, nativeErrorMessage } from "../../api/errors";
import type { PrivacyApi } from "../../api/privacy";
import type { NativeTransport } from "../../api/types";
import { defaultExportFiles, type ExportFileRegistry } from "./export-file";
import {
  isRetryablePrivacyStatusError,
  watchPrivacyStatus,
} from "./watch-status";

export type NativeExportScope =
  { kind: "export"; householdId: string } | { kind: "archive-export" };

interface ExportAttemptScope {
  actor: string;
  scopeKey: string;
  sourceIds: string[];
  permissionScope: Record<string, string>;
}

interface ExportHandle extends ExportAttemptScope {
  id: string;
}

export function permissionScope(
  accounts: readonly AccountResponse[],
  ids: readonly string[],
): Record<string, string> {
  return Object.fromEntries(
    accounts
      .filter((account) => ids.includes(account.id))
      .map((account) => [
        account.id,
        JSON.stringify([
          account.access,
          account.ownership,
          account.sharing?.version ?? null,
          account.permissions,
        ]),
      ]),
  );
}

export function useExportJob({
  accounts,
  streamScope,
  actor,
  refreshing,
  scopeError,
  active,
  privacy,
  transport,
  onAccessChanged,
  onRevoke,
  files = defaultExportFiles,
}: {
  accounts: readonly AccountResponse[];
  streamScope: NativeExportScope;
  actor: string;
  refreshing: boolean;
  scopeError: boolean;
  active: boolean;
  privacy: PrivacyApi;
  transport: NativeTransport;
  onAccessChanged: () => void;
  onRevoke: (actor: string) => void;
  files?: ExportFileRegistry;
}) {
  const scopeKey =
    streamScope.kind === "export"
      ? `export:${streamScope.householdId}`
      : "archive-export";
  const handle = useRef<ExportHandle | null>(null);
  const stop = useRef<(() => void) | null>(null);
  const submission = useRef<ExportAttemptScope | null>(null);
  const requestAbort = useRef<AbortController | null>(null);
  const downloadAbort = useRef<AbortController | null>(null);
  const revision = useRef(0);
  const [revalidation, setRevalidation] = useState(0);
  const [selected, setSelected] = useState<string[]>([]);
  const [job, setJob] = useState<ExportStatus | null>(null);
  const [pending, setPending] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [tracking, setTracking] = useState(false);
  const [error, setError] = useState("");
  const [mfa, setMfa] = useState(false);

  function fail(cause: unknown, retain = false) {
    if (!retain) handle.current = null;
    setTracking(false);
    submission.current = null;
    setPending(false);
    setDownloading(false);
    setJob(null);
    setError(nativeErrorMessage(cause));
    const freshMfa =
      cause instanceof NativeApiError &&
      (cause.code === "MFA_REQUIRED" || cause.code === "MFA_REAUTH_REQUIRED");
    setMfa(freshMfa);
    if (cause instanceof NativeApiError && cause.status === 401) {
      onRevoke(actor);
      return;
    }
    if (
      !freshMfa &&
      cause instanceof NativeApiError &&
      [403, 404, 409, 410].includes(cause.status)
    ) {
      onAccessChanged();
    }
  }

  useEffect(() => {
    const current = ++revision.current;
    stop.current?.();
    setTracking(false);
    setSelected([]);
    setJob(null);
    setError("");
    setMfa(false);
    if (!active) {
      requestAbort.current?.abort();
      downloadAbort.current?.abort();
      handle.current = null;
      submission.current = null;
      setPending(false);
      setDownloading(false);
      files.cleanupAll();
      return;
    }
    const saved = handle.current;
    const waiting = submission.current;
    const scope = saved ?? waiting;
    if (!scope) {
      setPending(false);
      return;
    }
    if (scopeError || scope.actor !== actor || scope.scopeKey !== scopeKey) {
      handle.current = null;
      submission.current = null;
      setPending(false);
      files.cleanupAll();
      return;
    }
    setPending(Boolean(waiting));
    if (refreshing) return;
    const visiblePermissions = permissionScope(accounts, scope.sourceIds);
    if (
      Object.entries(visiblePermissions).some(
        ([id, value]) => scope.permissionScope[id] !== value,
      )
    ) {
      handle.current = null;
      submission.current = null;
      setPending(false);
      files.cleanupAll();
      return;
    }
    if (!saved) return;
    setTracking(true);
    const selector =
      streamScope.kind === "export"
        ? ({
            kind: "export",
            householdId: streamScope.householdId,
            id: saved.id,
          } as const)
        : ({ kind: "archive-export", id: saved.id } as const);
    const closeWatch = watchPrivacyStatus({
      selector,
      transport,
      read: (signal) =>
        streamScope.kind === "export"
          ? privacy.readExportStatus(streamScope.householdId, saved.id, signal)
          : privacy.readArchiveExportStatus(saved.id, signal),
      receive: (value) => {
        if (current !== revision.current || handle.current !== saved) return;
        setJob(value);
        setError("");
        setTracking(false);
        if (["INVALIDATED", "EXPIRED", "FAILED"].includes(value.state)) {
          handle.current = null;
          closeWatch();
        }
      },
      unavailable: (cause) => {
        if (current !== revision.current) return;
        setJob(null);
        setError(cause ? nativeErrorMessage(cause) : "");
        setTracking(true);
      },
      failure: (cause) => {
        if (current !== revision.current) return;
        fail(cause, isRetryablePrivacyStatusError(cause));
      },
    });
    stop.current = closeWatch;
    return () => {
      closeWatch();
    };
  }, [accounts, scopeKey, actor, refreshing, scopeError, active, revalidation]);

  useEffect(
    () => () => {
      stop.current?.();
      requestAbort.current?.abort();
      downloadAbort.current?.abort();
      files.cleanupAll();
    },
    [files],
  );

  async function submit() {
    if (!active || selected.length === 0 || selected.length > 50) return;
    revision.current++;
    stop.current?.();
    requestAbort.current?.abort();
    setTracking(false);
    const scope: ExportAttemptScope = {
      scopeKey,
      actor,
      sourceIds: [...selected],
      permissionScope: permissionScope(accounts, selected),
    };
    const abort = new AbortController();
    requestAbort.current = abort;
    submission.current = scope;
    setPending(true);
    setMfa(false);
    setError("");
    setJob(null);
    handle.current = null;
    try {
      const value =
        streamScope.kind === "export"
          ? await privacy.requestExport(
              streamScope.householdId,
              scope.sourceIds,
              abort.signal,
            )
          : await privacy.requestArchiveExport(scope.sourceIds, abort.signal);
      if (submission.current === scope && !abort.signal.aborted) {
        handle.current = { ...scope, id: value.id };
        setJob(value);
        setRevalidation((old) => old + 1);
      }
    } catch (cause) {
      if (submission.current === scope && !abort.signal.aborted) fail(cause);
    } finally {
      if (submission.current === scope) {
        submission.current = null;
        setPending(false);
      }
    }
  }

  async function download() {
    if (!active || !job || job.state !== "READY" || downloading) return;
    downloadAbort.current?.abort();
    const abort = new AbortController();
    downloadAbort.current = abort;
    const exportId = job.id;
    setDownloading(true);
    setError("");
    setMfa(false);
    try {
      const bytes =
        streamScope.kind === "export"
          ? await privacy.downloadExport(
              streamScope.householdId,
              exportId,
              abort.signal,
            )
          : await privacy.downloadArchiveExport(exportId, abort.signal);
      if (abort.signal.aborted || !active) return;
      await files.shareAndCleanup(bytes);
    } catch (cause) {
      if (abort.signal.aborted) return;
      if (cause instanceof NativeApiError) {
        if (cause.status === 401) {
          onRevoke(actor);
          return;
        }
        if (
          cause.code === "MFA_REQUIRED" ||
          cause.code === "MFA_REAUTH_REQUIRED"
        ) {
          setMfa(true);
          setError(
            "Verify a fresh authenticator code in Account security, then try again.",
          );
          return;
        }
        if ([403, 404, 409, 410].includes(cause.status)) {
          handle.current = null;
          setJob(null);
          setError(
            "This download is unavailable or expired, or your access changed. Refresh your accounts and request a new export.",
          );
          onAccessChanged();
          return;
        }
      }
      setError(nativeErrorMessage(cause));
    } finally {
      if (downloadAbort.current === abort) setDownloading(false);
    }
  }

  function choose(id: string, checked?: boolean) {
    revision.current++;
    stop.current?.();
    setTracking(false);
    handle.current = null;
    setJob(null);
    setError("");
    setMfa(false);
    setSelected((old) => {
      const has = old.includes(id);
      const nextChecked = checked ?? !has;
      if (nextChecked) {
        if (has || old.length >= 50) return old;
        return [...old, id];
      }
      return old.filter((value) => value !== id);
    });
  }

  return {
    selected,
    choose,
    job: refreshing || scopeError || !active ? null : job,
    pending,
    downloading,
    error,
    mfa,
    tracking,
    retryable: Boolean(handle.current && error),
    retryStatus: () => setRevalidation((value) => value + 1),
    submit,
    download,
  };
}
