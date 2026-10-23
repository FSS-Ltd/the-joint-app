"use client";

import { HandleSSOCallback, useClerk } from "@clerk/nextjs";
import { useEffect, useState, type ReactNode } from "react";
import { Feedback, IdentityFrame } from "../frame";
import {
  announceSessionChange,
  errorMessage,
  finishAuth,
  request,
  type Identity,
} from "../client";
import { continuation } from "./use-auth-flow";
import { ClerkFlowFailure, taskPath } from "./flow";

export function ClerkCallback(): ReactNode {
  const [error, setError] = useState("");
  return (
    <IdentityFrame
      eyebrow="A secure return"
      title="Welcome back."
      description="Finishing your Google sign-in."
    >
      <section className="surface form-card">
        {!error && <p role="status">Checking your sign-in…</p>}
        <Feedback error={error} />
        <HandleSSOCallback
          navigateToApp={({ session, decorateUrl }) => {
            try {
              window.location.assign(
                decorateUrl(continuation(taskPath(session.currentTask?.key))),
              );
            } catch {
              setError(
                "An additional account requirement needs attention. Check the development authentication settings.",
              );
            }
          }}
          navigateToSignIn={() =>
            window.location.assign(continuation("/sign-in"))
          }
          navigateToSignUp={() =>
            window.location.assign(continuation("/sign-up"))
          }
        />
      </section>
    </IdentityFrame>
  );
}
export function ClerkCompletion(): ReactNode {
  const clerk = useClerk();
  const [error, setError] = useState("");
  useEffect(() => {
    let current = true;
    async function complete() {
      try {
        const path = taskPath(clerk.session?.currentTask?.key);
        if (path !== "/auth/complete") {
          window.location.replace(continuation(path));
          return;
        }
        const me = await request<Identity>("/api/me");
        if (!current) return;
        announceSessionChange();
        finishAuth(me.session.needsMfa ? "MFA_REQUIRED" : "AUTHENTICATED");
      } catch (cause) {
        if (current)
          setError(
            cause instanceof ClerkFlowFailure
              ? cause.message
              : errorMessage(cause),
          );
      }
    }
    void complete();
    return () => {
      current = false;
    };
  }, [clerk]);
  return (
    <IdentityFrame
      eyebrow="Your account"
      title="A home for your plans."
      description="Checking your household access."
    >
      <section className="surface form-card">
        {!error && <p role="status">Finishing sign-in…</p>}
        <Feedback error={error} />
        {error && (
          <>
            <p>
              Your sign-in does not change existing data or permissions.
              Existing accounts require proof before linking.
            </p>
            <a href="/sign-in">Return to sign-in</a>
          </>
        )}
      </section>
    </IdentityFrame>
  );
}
