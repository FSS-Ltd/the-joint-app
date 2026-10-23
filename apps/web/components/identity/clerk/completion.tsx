"use client";

import { LegacyLinkForm } from "./legacy-link-form";
import {
  HandleSSOCallback,
  useClerk,
  useSignIn,
  useSignUp,
} from "@clerk/nextjs";
import { useEffect, useState, type ReactNode } from "react";
import { Feedback, IdentityFrame } from "../frame";
import {
  RequestError,
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
  const { signIn } = useSignIn();
  const { signUp } = useSignUp();
  useEffect(() => {
    // The SDK callback handles transfers and challenges, but does not navigate
    // an existing sign-up that still needs a field such as username.
    if (
      signUp.id &&
      signUp.status === "missing_requirements" &&
      ["needs_identifier", "needs_first_factor"].includes(signIn.status) &&
      !signIn.isTransferable &&
      !signIn.protectCheck &&
      !signUp.isTransferable &&
      !signUp.protectCheck &&
      !signUp.missingFields.includes("protect_check") &&
      (signUp.missingFields.length > 0 || signUp.unverifiedFields.length > 0)
    ) {
      window.location.replace(continuation("/sign-up"));
    } else if (signIn.status === "needs_client_trust") {
      window.location.replace(continuation("/sign-in"));
    }
  }, [signIn, signUp]);
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
  const [needsLink, setNeedsLink] = useState(false);
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
        if (current) {
          setNeedsLink(
            cause instanceof RequestError &&
              cause.code === "IDENTITY_MIGRATION_REQUIRED",
          );
          setError(
            cause instanceof ClerkFlowFailure
              ? cause.message
              : errorMessage(cause),
          );
        }
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
        {needsLink && <LegacyLinkForm />}
        {error && !needsLink && (
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
