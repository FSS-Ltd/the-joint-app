"use client";
import { useCallback, useEffect, useState } from "react";
import {
  monthSchema,
  scopeAccountIdsSchema,
  spendingReportSchema,
  type SpendingReport,
} from "@joint/contracts";
import { useIdentity } from "../identity/use-identity";
import { useAccountList } from "../accounts/use-account-list";
import {
  errorMessage,
  RequestError,
  subscribeSessionChanges,
} from "../identity/client";
export function currentMonth(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
  }).format(new Date());
}
export function useSpendingReport() {
  const identity = useIdentity(),
    householdId = identity.identity?.membership?.householdId;
  const list = useAccountList(householdId);
  const [month, setMonth] = useState(currentMonth),
    [selected, setSelected] = useState<string[] | null>(null),
    [initialized, setInitialized] = useState(false),
    [report, setReport] = useState<SpendingReport | null>(null),
    [error, setError] = useState(""),
    [selectionError, setSelectionError] = useState(""),
    [pending, setPending] = useState(true),
    [revision, setRevision] = useState(0);
  const refresh = useCallback(() => {
    setReport(null);
    setRevision((v) => v + 1);
  }, []);
  const actor = identity.identity
    ? `${identity.identity.user.id}:${identity.identity.membership?.id ?? ""}:${identity.identity.membership?.grantVersion ?? 0}`
    : "";
  useEffect(() => {
    const p = new URLSearchParams(window.location.search),
      m = p.get("month"),
      ids = p.get("accountIds");
    if (m && monthSchema.safeParse(m).success) setMonth(m);
    if (ids) setSelected(ids.split(","));
    setInitialized(true);
  }, []);
  useEffect(() => {
    const focus = () => {
      setReport(null);
      void identity.refresh();
      void list.load();
      refresh();
    };
    window.addEventListener("focus", focus);
    window.addEventListener("online", focus);
    const unsubscribe = subscribeSessionChanges(() => {
      setReport(null);
      setSelected(null);
    });
    return () => {
      window.removeEventListener("focus", focus);
      window.removeEventListener("online", focus);
      unsubscribe();
    };
  }, [refresh, list.load, identity.refresh]);
  const scope = selected?.join(",") ?? "";
  useEffect(() => {
    if (!initialized) return;
    const query = new URLSearchParams({ month });
    if (scope) query.set("accountIds", scope);
    window.history.replaceState(
      null,
      "",
      `${window.location.pathname}?${query}`,
    );
  }, [initialized, month, scope]);
  useEffect(() => {
    const controller = new AbortController();
    setReport(null);
    setError("");
    setPending(Boolean(householdId));
    if (!initialized || !householdId || !actor || identity.error) {
      setPending(false);
      return;
    }
    if (
      selected !== null &&
      !scopeAccountIdsSchema.safeParse(selected).success
    ) {
      setError("Choose between one and fifty available accounts.");
      setPending(false);
      return;
    }
    const query = new URLSearchParams({ month });
    if (scope) query.set("accountIds", scope);
    void fetch(`/api/households/${householdId}/reports/spending?${query}`, {
      cache: "no-store",
      credentials: "same-origin",
      signal: controller.signal,
    })
      .then(async (response) => {
        const value: unknown = await response.json();
        if (!response.ok) {
          throw new RequestError(
            response.status === 404
              ? "This account selection is no longer available. Choose your accounts again."
              : response.status === 400
                ? "Choose between one and fifty available accounts, and a valid calendar month."
                : response.status === 401
                  ? "Your session expired. Sign in again."
                  : "This report could not be refreshed. Check your connection and try again.",
            response.status,
          );
        }
        return spendingReportSchema.parse(value);
      })
      .then((value) => {
        if (!controller.signal.aborted) setReport(value);
      })
      .catch((cause) => {
        if (!controller.signal.aborted) {
          setReport(null);
          setError(errorMessage(cause));
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setPending(false);
      });
    return () => controller.abort();
  }, [initialized, householdId, actor, month, scope, revision, identity.error]);
  function changeMonth(value: string) {
    setReport(null);
    setMonth(value);
  }
  function changeScope(ids: string[] | null) {
    if (ids !== null) {
      const parsed = scopeAccountIdsSchema.safeParse(ids);
      if (!parsed.success) {
        setSelectionError(
          "Choose between one and fifty available accounts. Keep at least one account selected.",
        );
        return;
      }
      ids = parsed.data;
    }
    setSelectionError("");
    setReport(null);
    setSelected(ids);
  }
  return {
    identity: identity.identity,
    householdId,
    month,
    setMonth: changeMonth,
    selected,
    setSelected: changeScope,
    report: identity.error ? null : report,
    error: identity.error || selectionError || list.error || error,
    pending: identity.loading || pending,
    refresh,
    accounts: list.items.filter((a) => a.access === "TRANSACTIONS"),
    more: list.nextCursor,
    loadMore: () => list.load(list.nextCursor ?? undefined),
  };
}
export type ReportState = ReturnType<typeof useSpendingReport>;
