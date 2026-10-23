"use client";

import { ClerkFailed, ClerkLoaded, ClerkLoading } from "@clerk/nextjs";
import { useEffect, useState, type ReactNode } from "react";
import { IdentityFrame } from "../frame";

export function AuthUnavailable(): ReactNode {
  return (
    <IdentityFrame
      eyebrow="Your account"
      title="A little patience."
      description="Your household data stays protected while sign-in is unavailable."
    >
      <section className="surface form-card">
        <h2>Sign-in needs attention</h2>
        <p role="alert">
          Check the local Clerk development settings, then restart the web app
          and API. If setup is complete, check your connection and try again.
        </p>
        <a className="button secondary" href="/sign-in">
          Try sign-in again
        </a>
      </section>
    </IdentityFrame>
  );
}
function Loading(): ReactNode {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setSlow(true), 10000);
    return () => clearTimeout(timer);
  }, []);
  return (
    <IdentityFrame
      eyebrow="Your account"
      title="A moment for you."
      description="Connecting securely to your sign-in provider."
    >
      <section className="surface form-card">
        <p role="status">
          {slow
            ? "Sign-in is taking longer than expected. Check your connection and reload this page."
            : "Preparing sign-in…"}
        </p>
        {slow && (
          <button
            type="button"
            className="button secondary"
            onClick={() => window.location.reload()}
          >
            Reload sign-in
          </button>
        )}
      </section>
    </IdentityFrame>
  );
}
export function ClerkAvailability({
  children,
}: {
  children: ReactNode;
}): ReactNode {
  return (
    <>
      <ClerkLoading>
        <Loading />
      </ClerkLoading>
      <ClerkFailed>
        <AuthUnavailable />
      </ClerkFailed>
      <ClerkLoaded>{children}</ClerkLoaded>
    </>
  );
}
