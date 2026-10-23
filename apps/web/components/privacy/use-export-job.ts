"use client";
import { useEffect, useRef, useState } from "react";
import type { AccountResponse, ExportStatus } from "@joint/contracts";
import { errorMessage, request, RequestError } from "../identity/client";

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
}: {
  accounts: AccountResponse[];
  path: string;
  actor: string;
  refreshing: boolean;
  scopeError: boolean;
  onAccessChanged: () => void;
}) {
  const handle = useRef<ExportHandle | null>(null);
  const submission = useRef<ExportScope | null>(null);
  const [revalidation, setRevalidation] = useState(0);
  const revision = useRef(0);
  const [selected, setSelected] = useState<string[]>([]);
  const [job, setJob] = useState<ExportStatus | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [mfa, setMfa] = useState(false);
  function fail(cause: unknown) {
    handle.current = null;
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
    // A paginated refresh may omit a source. Server status validates every
    // original source, including permissions absent from this list page.
    let active = true;
    void request<ExportStatus>(`${path}/${saved.id}`)
      .then((value) => {
        if (active && current === revision.current) {
          if (["INVALIDATED", "EXPIRED", "FAILED"].includes(value.state))
            handle.current = null;
          setJob(value);
        }
      })
      .catch((cause) => {
        if (active && current === revision.current) fail(cause);
      });
    return () => {
      active = false;
    };
  }, [accounts, path, actor, refreshing, scopeError, revalidation]);
  useEffect(() => {
    if (!job || !["QUEUED", "PROCESSING"].includes(job.state) || refreshing)
      return;
    const current = revision.current;
    let active = true;
    const timeout = window.setTimeout(() => {
      void request<ExportStatus>(`${path}/${job.id}`)
        .then((value) => {
          if (active && current === revision.current) {
            if (["INVALIDATED", "EXPIRED", "FAILED"].includes(value.state))
              handle.current = null;
            setJob(value);
          }
        })
        .catch((cause) => {
          if (active && current === revision.current) fail(cause);
        });
    }, 2000);
    return () => {
      active = false;
      window.clearTimeout(timeout);
    };
  }, [job, path, refreshing]);
  async function submit() {
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
    submit,
  };
}
