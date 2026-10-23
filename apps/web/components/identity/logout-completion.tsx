"use client";
import type { ReactNode } from "react";
import { Feedback, IdentityFrame } from "./frame";
import { useLogout } from "./use-logout";

export function LogoutCompletion({
  signout,
}: {
  signout: ReturnType<typeof useLogout>;
}): ReactNode {
  return (
    <IdentityFrame
      eyebrow="Your account"
      title="App access has ended."
      description="Finishing sign-out safely."
    >
      <section className="surface form-card" aria-busy={signout.pending}>
        <h2>
          {signout.providerPending
            ? "Provider cleanup pending"
            : "Finish browser sign-out"}
        </h2>
        <p role="status">
          {signout.providerPending
            ? "Your app session is revoked. Other provider sessions may still be active until cleanup succeeds. Retry uses the original sign-out scope; later sign-ins are preserved."
            : "Your completed sign-out request will not be repeated."}
        </p>
        <Feedback error={signout.error} />
        <button
          className="button primary"
          type="button"
          disabled={signout.pending}
          onClick={() => void signout.retry()}
        >
          {signout.pending ? "Finishing…" : "Retry sign-out cleanup"}
        </button>
        {signout.error && <a href="/sign-in">Return to sign-in</a>}
      </section>
    </IdentityFrame>
  );
}
export function LogoutRecovery(): ReactNode {
  const signout = useLogout(true);
  return <LogoutCompletion signout={signout} />;
}
