"use client";

import { useClerk } from "@clerk/nextjs";
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  authContinuation,
  readAuthDestination,
} from "../../../lib/auth-continuation";
import { errorMessage, request, RequestError, type Identity } from "../client";
import { Feedback, IdentityFrame } from "../frame";
import { LogoutCompletion } from "../logout-completion";
import { useLogout } from "../use-logout";
import { ClerkFlowFailure, taskPath } from "./flow";

export function ExistingSession({ search }: { search: string }): ReactNode {
  const clerk = useClerk();
  const signout = useLogout();
  const [attempt, setAttempt] = useState(0);
  const [error, setError] = useState("");
  const ending = useRef(false);

  function endSession(): void {
    ending.current = true;
    void signout.logout("local");
  }

  useEffect(() => {
    let current = true;
    const controller = new AbortController();
    setError("");
    async function check(): Promise<void> {
      try {
        const task = taskPath(clerk.session?.currentTask?.key);
        if (task !== "/auth/complete") {
          window.location.replace(
            authContinuation(task, search || "?next=dashboard"),
          );
          return;
        }
        const me = await request<Identity>("/api/me", undefined, undefined, {
          signal: controller.signal,
        });
        if (!current || ending.current) return;
        const requested = readAuthDestination(search);
        const destination =
          requested === "/household" && me.membership
            ? "/dashboard"
            : requested;
        const continuation = `?next=${destination === "/settings/privacy" ? "privacy" : destination.slice(1)}`;
        const security = new URL(
          authContinuation("/security", continuation),
          window.location.origin,
        );
        if (me.session.purpose === "RECOVERY")
          security.searchParams.set("recovery", "1");
        window.location.replace(
          me.session.purpose === "RECOVERY" || me.session.needsMfa
            ? security.pathname + security.search
            : destination,
        );
      } catch (cause) {
        if (!current || ending.current) return;
        if (
          cause instanceof RequestError &&
          cause.code === "IDENTITY_MIGRATION_REQUIRED"
        )
          window.location.replace(
            authContinuation("/auth/complete", search || "?next=dashboard"),
          );
        else if (cause instanceof RequestError && cause.status === 401)
          endSession();
        else
          setError(
            cause instanceof ClerkFlowFailure
              ? cause.message
              : errorMessage(cause),
          );
      }
    }
    void check();
    return () => {
      current = false;
      controller.abort();
    };
  }, [attempt, clerk.session?.id, search]);

  if (signout.started) return <LogoutCompletion signout={signout} />;
  return (
    <IdentityFrame
      eyebrow="Your account"
      title="Welcome back."
      description="Checking your session before opening your app."
    >
      <section
        className="surface form-card"
        aria-busy={!error && !signout.error}
      >
        {!error && !signout.error && (
          <p role="status">
            {signout.pending ? "Signing out…" : "Checking your session…"}
          </p>
        )}
        <Feedback error={signout.error || error} />
        {error && !ending.current && (
          <button
            className="button primary"
            type="button"
            onClick={() => setAttempt(attempt + 1)}
          >
            Retry session check
          </button>
        )}
        <button
          className="text-button"
          type="button"
          disabled={signout.pending}
          onClick={endSession}
        >
          Sign out of this browser
        </button>
      </section>
    </IdentityFrame>
  );
}
