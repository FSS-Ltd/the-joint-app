"use client";

import { useCallback, useEffect, useState } from "react";
import {
  errorMessage,
  request,
  RequestError,
  subscribeSessionChanges,
  type Identity,
} from "./client";

export function useIdentity(redirect = true): {
  identity: Identity | null;
  error: string;
  loading: boolean;
  refresh: () => Promise<void>;
} {
  const [identity, setIdentity] = useState<Identity | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setIdentity(await request<Identity>("/api/me"));
    } catch (cause) {
      if (cause instanceof RequestError && cause.status === 401) {
        setIdentity(null);
        if (redirect)
          window.location.replace(
            window.location.pathname === "/archive"
              ? "/sign-in?next=archive"
              : "/sign-in",
          );
      } else setError(errorMessage(cause));
    } finally {
      setLoading(false);
    }
  }, [redirect]);
  useEffect(() => {
    void refresh();
  }, [refresh]);
  useEffect(() => {
    function refreshRestoredPage(event: PageTransitionEvent) {
      if (event.persisted) window.location.reload();
    }
    window.addEventListener("pageshow", refreshRestoredPage);
    return () => window.removeEventListener("pageshow", refreshRestoredPage);
  }, []);
  useEffect(
    () =>
      subscribeSessionChanges(() => {
        setIdentity(null);
        setLoading(true);
        window.location.reload();
      }),
    [],
  );
  return { identity, error, loading, refresh };
}
