"use client";

import {
  TaskResetPassword,
  TaskSetupMFA,
  useClerk,
  useUser,
  useReverification,
} from "@clerk/nextjs";
import { useSearchParams } from "next/navigation";
import { authContinuation } from "../../../lib/auth-continuation";
import { useState, type FormEvent, type ReactNode } from "react";
import { Feedback, IdentityFrame } from "../frame";
import {
  announceSessionChange,
  errorMessage,
  nextDestination,
  request,
} from "../client";
import { AuthenticatorEnrollment } from "./authenticator-enrollment";
import { clerkFlowError } from "./flow";

const appearance = {
  variables: {
    colorPrimary: "#244F42",
    colorText: "#203B32",
    colorBackground: "#FFFFFF",
    colorDanger: "#9A302A",
    borderRadius: "0.5rem",
  },
};
export function ClerkPasswordTask(): ReactNode {
  const search = useSearchParams().toString();
  return (
    <IdentityFrame
      eyebrow="Your account, protected"
      title="A fresh password."
      description="Complete this security check before returning to your household."
    >
      <TaskResetPassword
        redirectUrlComplete={authContinuation("/auth/complete", search)}
        appearance={appearance}
      />
    </IdentityFrame>
  );
}
export function ClerkSecurity(): ReactNode {
  const clerk = useClerk();
  const parameters = useSearchParams();
  const search = parameters.toString();
  const recovering = parameters.get("recover") === "1";
  const { user, isLoaded } = useUser();
  const [enrollment, setEnrollment] = useState<{
    secret: string;
    uri: string | null;
  } | null>(null);
  const secret = enrollment?.secret ?? "";
  const [code, setCode] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [backupCodes, setBackupCodes] = useState<ReadonlyArray<string>>([]);
  const createCodes = useReverification(async () => {
    if (!user) throw new Error();
    return user.createBackupCode();
  });
  const disableAuthenticator = useReverification(async () => {
    if (!user) throw new Error();
    return user.disableTOTP();
  });
  async function replaceAuthenticator() {
    if (!user || pending) return;
    setPending(true);
    setError("");
    try {
      // Record the MFA requirement before removal. Provider recovery never grants finance access.
      await request("/api/me");
      await disableAuthenticator();
      await user.reload();
      setBackupCodes([]);
      setNotice(
        "Old authenticator removed. Set up a replacement and verify it to regain app access.",
      );
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setPending(false);
    }
  }
  async function enroll() {
    if (!user || pending) return;
    setPending(true);
    setError("");
    try {
      const result = await user.createTOTP();
      if (!result.secret) throw new Error();
      setEnrollment({ secret: result.secret, uri: result.uri ?? null });
    } catch (cause) {
      setError(clerkFlowError(cause));
    } finally {
      setPending(false);
    }
  }
  async function verify(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!user || pending) return;
    setPending(true);
    setError("");
    try {
      if (secret) {
        await user.verifyTOTP({ code });
        await user.reload();
        setEnrollment(null);
        setCode("");
        setNotice(
          "Authenticator enabled. Wait for the next code, then verify this session.",
        );
        return;
      }
      await clerk.session?.getToken({ skipCache: true });
      await request("/api/auth/mfa/verify", { factorId: "clerk_totp", code });
      setEnrollment(null);
      setCode("");
      announceSessionChange();
      window.location.assign(nextDestination());
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setPending(false);
    }
  }
  async function recoveryCodes() {
    if (!user || pending) return;
    setPending(true);
    setError("");
    try {
      setBackupCodes((await createCodes()).codes);
    } catch (cause) {
      setError(clerkFlowError(cause));
    } finally {
      setPending(false);
    }
  }
  return (
    <IdentityFrame
      eyebrow="Your account, protected"
      title="A little extra peace of mind."
      description="Keep your shared home secure, with a sign-in that belongs to you."
      navigation={user ? "security" : undefined}
    >
      {clerk.session?.currentTask?.key === "setup-mfa" ? (
        <TaskSetupMFA
          redirectUrlComplete={authContinuation("/auth/complete", search)}
          appearance={appearance}
        />
      ) : (
        <section
          className="surface form-card"
          aria-labelledby="security-heading"
        >
          <p className="step-label">Two-step verification</p>
          <h2 id="security-heading">Your authenticator</h2>
          <Feedback error={error} success={notice} />
          {!isLoaded ? (
            <p role="status">Loading account security…</p>
          ) : !user ? (
            <a href="/sign-in">Sign in to manage security</a>
          ) : (
            <>
              <p>
                Use your authenticator app to verify this session. Sensitive
                actions require a recent code.
              </p>
              {recovering && user.totpEnabled && (
                <section aria-label="Lost authenticator recovery">
                  <p>
                    Replacing your authenticator removes the old factor.
                    Household access stays blocked until you set up a
                    replacement and verify a fresh code. Clerk may ask you to
                    verify a backup code again.
                  </p>
                  <button
                    type="button"
                    className="button secondary"
                    disabled={pending}
                    onClick={() => void replaceAuthenticator()}
                  >
                    Replace lost authenticator
                  </button>
                </section>
              )}
              {!user.totpEnabled && !secret && (
                <button
                  className="button primary"
                  type="button"
                  disabled={pending}
                  onClick={() => void enroll()}
                >
                  Set up authenticator
                </button>
              )}
              {enrollment && (
                <AuthenticatorEnrollment
                  key={enrollment.secret}
                  secret={enrollment.secret}
                  uri={enrollment.uri}
                />
              )}
              {(user.totpEnabled || secret) && (
                <form
                  className="form-stack"
                  onSubmit={verify}
                  aria-busy={pending}
                >
                  <label>
                    Authenticator code
                    <input
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      pattern="[0-9]{6}"
                      minLength={6}
                      maxLength={6}
                      required
                      disabled={pending}
                      value={code}
                      onChange={(e) => setCode(e.target.value.trim())}
                    />
                  </label>
                  <button
                    className="button primary"
                    disabled={pending}
                    type="submit"
                  >
                    {pending ? "Verifying…" : "Verify authenticator"}
                  </button>
                </form>
              )}
              {user.totpEnabled && (
                <button
                  type="button"
                  className="text-button"
                  disabled={pending}
                  onClick={() => void recoveryCodes()}
                >
                  Create new backup codes
                </button>
              )}
              {backupCodes.length > 0 && (
                <section aria-label="Private backup codes">
                  <p>
                    Store these codes privately. Each works once. Generating new
                    codes replaces older codes.
                  </p>
                  <ul>
                    {backupCodes.map((value) => (
                      <li key={value}>
                        <code>{value}</code>
                      </li>
                    ))}
                  </ul>
                  <button
                    type="button"
                    className="text-button"
                    onClick={() => setBackupCodes([])}
                  >
                    Hide codes
                  </button>
                </section>
              )}
            </>
          )}
        </section>
      )}
    </IdentityFrame>
  );
}
