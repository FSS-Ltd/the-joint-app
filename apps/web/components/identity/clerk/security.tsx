"use client";

import {
  TaskResetPassword,
  TaskSetupMFA,
  useClerk,
  useUser,
  useReverification,
} from "@clerk/nextjs";
import { useState, type FormEvent, type ReactNode } from "react";
import { Feedback, IdentityFrame } from "../frame";
import {
  announceSessionChange,
  errorMessage,
  nextDestination,
  request,
} from "../client";
import { clerkFlowError } from "./flow";

const appearance = {
  variables: {
    colorPrimary: "#244F42",
    colorText: "#203B32",
    colorBackground: "#FFFFFF",
    colorDanger: "#9A302A",
    borderRadius: "0.75rem",
  },
};
export function ClerkPasswordTask(): ReactNode {
  return (
    <IdentityFrame
      eyebrow="Your account, protected"
      title="A fresh password."
      description="Complete this security check before returning to your household."
    >
      <TaskResetPassword
        redirectUrlComplete="/auth/complete"
        appearance={appearance}
      />
    </IdentityFrame>
  );
}
export function ClerkSecurity(): ReactNode {
  const clerk = useClerk();
  const { user, isLoaded } = useUser();
  const [secret, setSecret] = useState("");
  const [code, setCode] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [backupCodes, setBackupCodes] = useState<ReadonlyArray<string>>([]);
  const createCodes = useReverification(async () => {
    if (!user) throw new Error();
    return user.createBackupCode();
  });
  async function enroll() {
    if (!user || pending) return;
    setPending(true);
    setError("");
    try {
      const result = await user.createTOTP();
      if (!result.secret) throw new Error();
      setSecret(result.secret);
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
        setSecret("");
        setCode("");
        setNotice(
          "Authenticator enabled. Wait for the next code, then verify this session.",
        );
        return;
      }
      await clerk.session?.getToken({ skipCache: true });
      await request("/api/auth/mfa/verify", { factorId: "clerk_totp", code });
      setSecret("");
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
    >
      <nav className="account-nav" aria-label="Your account">
        <a href="/household">Back to household</a>
        <a href="/accounts">Accounts</a>
      </nav>
      {clerk.session?.currentTask?.key === "setup-mfa" ? (
        <TaskSetupMFA
          redirectUrlComplete="/auth/complete"
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
              {secret && (
                <div className="enrollment">
                  <p className="privacy-label">
                    Private setup · Do not share this key.
                  </p>
                  <p>
                    Choose manual setup in your authenticator app. Add The
                    Family Fund App and enter this key.
                  </p>
                  <code className="setup-secret">{secret}</code>
                </div>
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
