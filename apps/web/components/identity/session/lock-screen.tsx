import type { ReactNode } from "react";
import { IdentityFrame } from "../frame";
import type { useLogout } from "../use-logout";

export type SessionLockState = "checking" | "unavailable" | "expired";

export function SessionLockScreen({
  state,
  signout,
  retrySession,
}: {
  state: SessionLockState;
  signout: ReturnType<typeof useLogout>;
  retrySession(): void;
}): ReactNode {
  const expired = state === "expired";
  return (
    <IdentityFrame
      idPrefix="session-lock"
      eyebrow="Your private account"
      title={expired ? "Your session is locked" : "Checking your session"}
      description={
        expired
          ? "Ten minutes without activity ends access. Sign in again to continue."
          : "We’re checking access before showing your household."
      }
    >
      <section className="surface form-card" aria-live="polite">
        {expired ? (
          <>
            <p>
              {signout.pending
                ? "Signing out of this browser…"
                : signout.error || "Fresh sign-in is required."}
            </p>
            {!signout.pending && (
              <button
                type="button"
                className="button primary"
                onClick={() =>
                  void (signout.started
                    ? signout.retry()
                    : signout.logout("local"))
                }
              >
                Retry sign-out
              </button>
            )}
          </>
        ) : state === "unavailable" ? (
          <>
            <p>
              We could not verify your session. Your household stays locked
              until access is checked.
            </p>
            <button
              type="button"
              className="button primary"
              onClick={retrySession}
            >
              Retry session check
            </button>
          </>
        ) : (
          <p role="status">Checking access…</p>
        )}
      </section>
    </IdentityFrame>
  );
}
