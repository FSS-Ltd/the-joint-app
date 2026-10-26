"use client";

import { useState } from "react";
import { useAuthRuntime } from "./auth-runtime";
import { errorMessage, request, RequestError } from "./client";
import { authContinuation } from "../../lib/auth-continuation";

export function useLogout(resumeCleanup = false) {
  const { finishSignOut } = useAuthRuntime();
  const [pending, setPending] = useState(false);
  const [started, setStarted] = useState(resumeCleanup);
  const [providerPending, setProviderPending] = useState(resumeCleanup);
  const [error, setError] = useState("");
  async function finish(remotePending: boolean) {
    setStarted(true);
    setProviderPending(remotePending);
    try {
      await finishSignOut();
      if (!remotePending)
        window.location.assign(
          authContinuation(
            "/sign-in",
            window.location.pathname === "/archive"
              ? "?next=archive"
              : window.location.search,
          ),
        );
    } catch {
      setError(
        "App access has ended. Browser sign-out could not finish. Retry below.",
      );
    } finally {
      setPending(false);
    }
  }
  async function logout(scope: "local" | "global") {
    if (pending) return;
    setPending(true);
    setError("");
    try {
      const result = await request<{ providerCleanupPending?: boolean }>(
        "/api/auth/logout",
        { scope },
      );
      await finish(result.providerCleanupPending === true);
    } catch (cause) {
      if (cause instanceof RequestError && cause.status === 401) {
        // Access already ended (including another tab's logout). Still clear
        // the browser provider session before presenting fresh sign-in.
        await finish(false);
      } else {
        setError(errorMessage(cause));
        setPending(false);
      }
    }
  }
  async function retry() {
    if (pending) return;
    setPending(true);
    setError("");
    try {
      const result = providerPending
        ? await request<{ providerCleanupPending?: boolean }>(
            "/api/auth/logout/retry",
            {},
          )
        : {};
      await finish(result.providerCleanupPending === true);
    } catch (cause) {
      setError(errorMessage(cause));
      setPending(false);
    }
  }
  return { started, pending, providerPending, error, logout, retry };
}
