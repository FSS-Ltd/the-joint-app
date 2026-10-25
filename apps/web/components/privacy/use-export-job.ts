"use client";
import { useEffect, useRef, useState } from "react";
import type { AccountResponse, ExportStatus } from "@joint/contracts";
import { watchStatusResource } from "../events/status-subscription";
import { errorMessage, request, RequestError } from "../identity/client";

export type ExportStatusScope =
  { kind: "export"; householdId: string } | { kind: "archive-export" };

interface ExportScope {
  actor: string;
  path: string;
  sourceIds: string[];
  permissionScope: Record<string, string>;
}
interface ExportHandle extends ExportScope {
  id: string;
}
function permissionScope(
  accounts: AccountResponse[],
  ids: string[],
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
  path,
  actor,
  refreshing,
  scopeError,
  onAccessChanged,
  streamScope,
}: {
  accounts: AccountResponse[];
  path: string;
  actor: string;
  refreshing: boolean;
  scopeError: boolean;
  onAccessChanged: () => void;
  streamScope: ExportStatusScope;
}) {
  const handle = useRef<ExportHandle | null>(null);
  const stop = useRef<(() => void) | null>(null);
  const [tracking, setTracking] = useState(false);
  const streamKind = streamScope.kind;
  const streamHousehold =
    streamScope.kind === "export" ? streamScope.householdId : null;
  const submission = useRef<ExportScope | null>(null);
  const [revalidation, setRevalidation] = useState(0);
  const revision = useRef(0);
  const [selected, setSelected] = useState<string[]>([]);
  const [job, setJob] = useState<ExportStatus | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [mfa, setMfa] = useState(false);
  function fail(cause: unknown, retain = false) {
    if (!retain) handle.current = null;
    setTracking(false);
    submission.current = null;
    setPending(false);
    setJob(null);
    setError(errorMessage(cause));
    const freshMfa =
      cause instanceof RequestError && cause.code === "MFA_REAUTH_REQUIRED";
    setMfa(freshMfa);
    if (
      !freshMfa &&
      cause instanceof RequestError &&
      [401, 403, 404, 409].includes(cause.status)
    )
      onAccessChanged();
  }
  useEffect(() => {
    const current = ++revision.current;
    stop.current?.();
    setTracking(false);
    setSelected([]);
    setJob(null);
    setError("");
    setMfa(false);
    const saved = handle.current;
    const waiting = submission.current;
    const scope = saved ?? waiting;
    if (!scope) {
      setPending(false);
      return;
    }
    if (scopeError || scope.actor !== actor || scope.path !== path) {
      handle.current = null;
      submission.current = null;
      setPending(false);
      return;
    }
    setPending(Boolean(waiting));
    // Financial rows disappear during refresh. Only opaque authority remains.
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
      return;
    }
    if (!saved) return;
    // A paginated refresh may omit a source. Every status read still checks all
    // original sources server-side, including permissions absent from this page.
    setTracking(true);
    const closeWatch = watchStatusResource({
      selector: { ...streamScope, id: saved.id },
      read: (signal) =>
        request<ExportStatus>(`${path}/${saved.id}`, undefined, undefined, {
          signal,
        }),
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
        setError(cause ? errorMessage(cause) : "");
        setTracking(true);
      },
      failure: (cause) => {
        if (current !== revision.current) return;
        const retain =
          cause instanceof RequestError &&
          (cause.status === 0 || cause.status >= 500);
        fail(cause, retain);
      },
    });
    stop.current = closeWatch;
    return () => {
      closeWatch();
    };
  }, [
    accounts,
    path,
    actor,
    refreshing,
    scopeError,
    revalidation,
    streamKind,
    streamHousehold,
  ]);
  async function submit() {
    revision.current++;
    stop.current?.();
    setTracking(false);
    const scope: ExportScope = {
      path,
      actor,
      sourceIds: [...selected],
      permissionScope: permissionScope(accounts, selected),
    };
    submission.current = scope;
    setPending(true);
    setMfa(false);
    setError("");
    setJob(null);
    handle.current = null;
    try {
      const value = await request<ExportStatus>(path, {
        accountIds: scope.sourceIds,
      });
      if (submission.current === scope) {
        handle.current = { ...scope, id: value.id };
        // Even a delayed POST response must pass current server authority again.
        setRevalidation((value) => value + 1);
      }
    } catch (cause) {
      if (submission.current === scope) fail(cause);
    } finally {
      if (submission.current === scope) {
        submission.current = null;
        setPending(false);
      }
    }
  }
  function choose(id: string, checked: boolean) {
    revision.current++;
    stop.current?.();
    setTracking(false);
    handle.current = null;
    setJob(null);
    setSelected((old) =>
      checked ? [...old, id] : old.filter((value) => value !== id),
    );
  }
  return {
    selected,
    choose,
    job: refreshing || scopeError ? null : job,
    pending,
    error,
    mfa,
    tracking,
    retryable: Boolean(handle.current && error),
    retryStatus: () => setRevalidation((value) => value + 1),
    submit,
  };
}
