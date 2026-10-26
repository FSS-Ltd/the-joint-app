"use client";

import { ProtectedSession } from "./session/boundary";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { errorMessage, request } from "./client";
import { Feedback, IdentityFrame } from "./frame";
import { useIdentity } from "./use-identity";

export function JoinHousehold(): ReactNode {
  const { identity, loading, error: loadError, refresh } = useIdentity(false);
  const captured = useRef(false);
  const invitationToken = useRef<string | null>(null);
  const [captureFailed, setCaptureFailed] = useState(false);
  const [capturing, setCapturing] = useState(true);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const captureInvitation = useCallback(async () => {
    const token = invitationToken.current;
    if (!token) {
      setCapturing(false);
      return;
    }
    setCapturing(true);
    setCaptureFailed(false);
    setError("");
    try {
      await request("/api/auth/invitation", { token });
      invitationToken.current = null;
    } catch (cause) {
      setError(errorMessage(cause));
      setCaptureFailed(true);
    } finally {
      setCapturing(false);
    }
  }, []);
  useEffect(() => {
    function captureFragment() {
      const token = new URLSearchParams(window.location.hash.slice(1)).get(
        "invite",
      );
      if (!token) {
        if (!captured.current) setCapturing(false);
        return;
      }
      captured.current = true;
      window.history.replaceState(
        null,
        "",
        window.location.pathname + window.location.search,
      );
      invitationToken.current = token;
      setAccepted(false);
      void captureInvitation();
    }
    captureFragment();
    window.addEventListener("hashchange", captureFragment);
    return () => window.removeEventListener("hashchange", captureFragment);
  }, [captureInvitation]);
  async function accept() {
    setPending(true);
    setError("");
    try {
      await request("/api/invitations/accept", {});
      setAccepted(true);
      await refresh();
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setPending(false);
    }
  }
  const content = (
    <IdentityFrame
      eyebrow="An invitation to together"
      title="There's a place for you."
      description="Join a household with your own account, and start your shared chapter."
    >
      <section className="surface form-card" aria-labelledby="join-heading">
        <p className="step-label">A home for two</p>
        <h2 id="join-heading">
          {accepted ? "You're part of the household" : "Join your household"}
        </h2>
        <Feedback
          error={error || loadError}
          success={
            accepted
              ? "Invitation accepted. Your household is ready."
              : undefined
          }
        />
        {loading || capturing ? (
          <p role="status">Preparing your invitation…</p>
        ) : captureFailed ? (
          <button
            className="button secondary"
            type="button"
            onClick={() => void captureInvitation()}
          >
            Try preparing invitation again
          </button>
        ) : accepted ? (
          <>
            <p>{identity?.membership?.household.name}</p>
            <a className="button primary" href="/household">
              Go to your household<span aria-hidden="true">↗</span>
            </a>
          </>
        ) : identity ? (
          <>
            <p>
              You are signed in as{" "}
              <strong className="break-word">{identity.user.email}</strong>.
            </p>
            <p>
              Accept only if you expected this invitation. Your email must match
              the invited address.
            </p>
            <button
              className="button primary"
              disabled={pending}
              type="button"
              onClick={() => void accept()}
            >
              {pending ? "Joining household…" : "Accept invitation"}
              <span aria-hidden="true">↗</span>
            </button>
            <a className="form-link" href="/household">
              Back to your account
            </a>
          </>
        ) : (
          <>
            <p>
              Sign in or create an account with the email address your
              invitation was sent to.
            </p>
            <a className="button primary" href="/sign-in?next=join">
              Sign in to continue<span aria-hidden="true">↗</span>
            </a>
            <a className="button secondary" href="/sign-up?next=join">
              Create an account
            </a>
          </>
        )}
        {loadError && (
          <button
            type="button"
            className="text-button"
            onClick={() => void refresh()}
          >
            Try again
          </button>
        )}
        <p className="field-hint">
          Invitations are private, single-use and valid for 7 days. If yours has
          expired, ask your household admin for a new link.
        </p>
      </section>
    </IdentityFrame>
  );
  return identity ? <ProtectedSession>{content}</ProtectedSession> : content;
}
