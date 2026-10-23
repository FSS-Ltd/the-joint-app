"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { AccountResponse } from "@joint/contracts";
import { errorMessage, request } from "../identity/client";
import { accountPath } from "./presentation";

export function useAccountList(householdId?: string): {
  items: AccountResponse[];
  nextCursor: string | null;
  loading: boolean;
  error: string;
  load: (cursor?: string) => Promise<void>;
} {
  const [items, setItems] = useState<AccountResponse[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const revision = useRef(0);
  const load = useCallback(
    async (cursor?: string) => {
      const current = ++revision.current;
      setError("");
      setLoading(Boolean(householdId));
      if (!cursor) {
        setItems([]);
        setNextCursor(null);
      }
      if (!householdId) return;
      try {
        const query = new URLSearchParams({ limit: "50" });
        if (cursor) query.set("cursor", cursor);
        const result = await request<{
          items: AccountResponse[];
          nextCursor: string | null;
        }>(`${accountPath(householdId)}?${query}`);
        if (current !== revision.current) return;
        setItems((previous) =>
          cursor ? [...previous, ...result.items] : result.items,
        );
        setNextCursor(result.nextCursor);
      } catch (cause) {
        if (current === revision.current) {
          setItems([]);
          setNextCursor(null);
          setError(errorMessage(cause));
        }
      } finally {
        if (current === revision.current) setLoading(false);
      }
    },
    [householdId],
  );
  useEffect(() => {
    void load();
    return () => {
      revision.current++;
    };
  }, [load]);
  return { items, nextCursor, loading, error, load };
}
