"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { AccountResponse } from "@joint/contracts";
import { errorMessage, request } from "../identity/client";

export function usePrivacyAccounts(path: string | null) {
  const [accounts, setAccounts] = useState<AccountResponse[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const revision = useRef(0);
  const load = useCallback(
    async (next?: string) => {
      const current = ++revision.current;
      setLoading(Boolean(path));
      setError("");
      if (!next) {
        setAccounts([]);
        setCursor(null);
      }
      if (!path) return;
      try {
        const query = new URLSearchParams({
          limit: "50",
          ...(next ? { cursor: next } : {}),
        });
        const result = await request<{
          items: AccountResponse[];
          nextCursor: string | null;
        }>(`${path}?${query}`);
        if (current === revision.current) {
          setAccounts((old) =>
            next ? [...old, ...result.items] : result.items,
          );
          setCursor(result.nextCursor);
        }
      } catch (cause) {
        if (current === revision.current) {
          setAccounts([]);
          setCursor(null);
          setError(errorMessage(cause));
        }
      } finally {
        if (current === revision.current) setLoading(false);
      }
    },
    [path],
  );
  useEffect(() => {
    void load();
    return () => {
      revision.current++;
    };
  }, [load]);
  useEffect(() => {
    const refresh = () => {
      void load();
    };
    const visible = () => {
      if (document.visibilityState === "visible") refresh();
    };
    window.addEventListener("focus", refresh);
    window.addEventListener("online", refresh);
    document.addEventListener("visibilitychange", visible);
    return () => {
      window.removeEventListener("focus", refresh);
      window.removeEventListener("online", refresh);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [load]);
  return { accounts, cursor, error, loading, load };
}
