"use client";

import { useSearchParams } from "next/navigation";
import { authContinuation } from "../../../lib/auth-continuation";
import { useState, type FormEvent, type ReactNode } from "react";
import { authContent, type AuthMode } from "../auth-content";
import { Feedback, IdentityFrame } from "../frame";
import { PasswordField } from "../password-field";
import { useClerkAuthFlow } from "./use-auth-flow";

export function ClerkAuthForm({
  mode,
  cleanupPending = false,
}: {
  mode: AuthMode;
  cleanupPending?: boolean;
}): ReactNode {
  const flow = useClerkAuthFlow(mode);
  const search = useSearchParams().toString();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [backupCode, setBackupCode] = useState(false);
  const [username, setUsername] = useState("");
  const text = authContent[mode];
  const stage = flow.stage.step;
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (await flow.submit(email, password, code, backupCode, username)) {
      setPassword("");
      setCode("");
    }
  }
  const verification = stage === "email" || stage === "mfa";
  return (
    <IdentityFrame {...text}>
      <section className="surface form-card" aria-labelledby="form-title">
        <p className="step-label">
          {verification
            ? "One small check"
            : stage === "password" || stage === "username"
              ? "One last step"
              : "Your private account"}
        </p>
        <h2 id="form-title">
          {stage === "email"
            ? "Verify your email"
            : stage === "mfa"
              ? "Verify your authenticator"
              : stage === "username"
                ? "Choose your username"
                : stage === "password"
                  ? "Choose a new password"
                  : text.heading}
        </h2>
        {flow.hasExistingSession && (
          <p role="status">
            You are already signed in.{" "}
            <button
              type="button"
              className="text-button"
              disabled={flow.pending}
              onClick={() => void flow.signOutExisting()}
            >
              Sign out of this browser
            </button>{" "}
            before starting another sign-in.
          </p>
        )}
        {cleanupPending && (
          <p role="status">
            A previous provider sign-out still needs cleanup.{" "}
            <a href="/sign-out">Finish previous sign-out</a>
          </p>
        )}
        {stage === "email" && (
          <p>
            Enter the code sent to{" "}
            <strong className="break-word">
              {email || "your email address"}
            </strong>
            . Check your spam folder if it has not arrived.
          </p>
        )}
        {stage === "username" && (
          <p>
            Your email is verified. Choose a username to finish creating your
            account.
          </p>
        )}
        {verification && (
          <button
            type="button"
            className="text-button"
            disabled={flow.pending}
            onClick={() => {
              setBackupCode(false);
              setCode("");
              void flow.restart();
            }}
          >
            Start again
          </button>
        )}
        {stage === "mfa" && (
          <>
            <p>
              {backupCode
                ? "Enter a private one-time backup code. This opens security recovery; it does not grant access to household finances."
                : "Enter the six-digit code from your authenticator app."}
            </p>
            {flow.backupAvailable && (
              <button
                type="button"
                className="text-button"
                disabled={flow.pending}
                onClick={() => {
                  setBackupCode(!backupCode);
                  setCode("");
                }}
              >
                {backupCode ? "Use an authenticator code" : "Use a backup code"}
              </button>
            )}
          </>
        )}
        <form className="form-stack" onSubmit={submit} aria-busy={flow.pending}>
          {stage === "username" && (
            <label>
              Username
              <input
                autoComplete="username"
                required
                minLength={4}
                maxLength={64}
                disabled={flow.pending}
                value={username}
                onChange={(event) => setUsername(event.target.value)}
              />
            </label>
          )}
          {stage === "credentials" && (
            <label>
              Email address
              <input
                type="email"
                autoComplete="email"
                required
                maxLength={254}
                disabled={flow.pending}
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </label>
          )}
          {(stage === "password" ||
            (stage === "credentials" && mode !== "recovery")) && (
            <PasswordField
              label={stage === "password" ? "New password" : "Password"}
              hint={
                mode === "sign-in" && stage === "credentials"
                  ? "Use the password for your Family Fund account."
                  : "Use 12–128 characters. A longer phrase works well."
              }
              value={password}
              onChange={setPassword}
              disabled={flow.pending}
              autoComplete={
                mode === "sign-in" && stage === "credentials"
                  ? "current-password"
                  : "new-password"
              }
              minLength={mode === "sign-in" && stage === "credentials" ? 1 : 12}
            />
          )}
          {verification && (
            <label>
              {stage === "mfa"
                ? backupCode
                  ? "Backup code"
                  : "Authenticator code"
                : "Email verification code"}
              <input
                inputMode={stage === "mfa" && backupCode ? "text" : "numeric"}
                autoComplete="one-time-code"
                pattern={stage === "mfa" && backupCode ? undefined : "[0-9]{6}"}
                required
                minLength={stage === "mfa" && backupCode ? 1 : 6}
                maxLength={stage === "mfa" && backupCode ? 128 : 6}
                disabled={flow.pending}
                value={code}
                onChange={(event) => setCode(event.target.value.trim())}
              />
            </label>
          )}
          <Feedback error={flow.error} success={flow.notice} />
          <div id="clerk-captcha" />
          <button
            type="submit"
            className="button primary"
            disabled={flow.pending || stage === "complete"}
          >
            {flow.pending
              ? "Please wait…"
              : verification
                ? "Verify code"
                : stage === "username"
                  ? "Continue"
                  : stage === "password"
                    ? "Save new password"
                    : text.action}
            <span aria-hidden="true">↗</span>
          </button>
        </form>
        {stage === "email" && (
          <button
            type="button"
            className="text-button"
            disabled={flow.pending || flow.resendSeconds > 0}
            onClick={() => void flow.resend()}
          >
            {flow.resendSeconds > 0
              ? `Send a new code in ${flow.resendSeconds}s`
              : "Send a new code"}
          </button>
        )}
        {stage === "credentials" && mode !== "recovery" && (
          <button
            type="button"
            className="button secondary google-button"
            disabled={flow.pending}
            onClick={() => void flow.google()}
          >
            Continue with Google
          </button>
        )}
        {mode === "sign-in" && (
          <p>
            <a href={authContinuation("/recovery", search)}>
              Forgot your password?
            </a>
          </p>
        )}
        <p>
          {mode === "sign-up"
            ? "Already have an account?"
            : "New to The Family Fund App?"}{" "}
          <a
            href={authContinuation(
              mode === "sign-up" ? "/sign-in" : "/sign-up",
              search,
            )}
          >
            {mode === "sign-up" ? "Sign in" : "Create an account"}
          </a>
        </p>
      </section>
    </IdentityFrame>
  );
}
