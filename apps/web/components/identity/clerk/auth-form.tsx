"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import { authContent, type AuthMode } from "../auth-content";
import { Feedback, IdentityFrame } from "../frame";
import { PasswordField } from "../password-field";
import { useClerkAuthFlow } from "./use-auth-flow";

export function ClerkAuthForm({ mode }: { mode: AuthMode }): ReactNode {
  const flow = useClerkAuthFlow(mode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const text = authContent[mode];
  const stage = flow.stage.step;
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (await flow.submit(email, password, code)) {
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
            : stage === "password"
              ? "One last step"
              : "Your private account"}
        </p>
        <h2 id="form-title">
          {stage === "email"
            ? "Verify your email"
            : stage === "mfa"
              ? "Verify your authenticator"
              : stage === "password"
                ? "Choose a new password"
                : text.heading}
        </h2>
        {stage === "email" && (
          <p>
            Enter the code sent to{" "}
            <strong className="break-word">
              {email || "your email address"}
            </strong>
            . Check your spam folder if it has not arrived.
          </p>
        )}
        {verification && (
          <button
            type="button"
            className="text-button"
            disabled={flow.pending}
            onClick={() => void flow.restart()}
          >
            Start again
          </button>
        )}
        {stage === "mfa" && (
          <p>Enter the six-digit code from your authenticator app.</p>
        )}
        <form className="form-stack" onSubmit={submit} aria-busy={flow.pending}>
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
                ? "Authenticator code"
                : "Email verification code"}
              <input
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]{6}"
                required
                minLength={6}
                maxLength={6}
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
            disabled={flow.pending}
            onClick={() => void flow.resend()}
          >
            Send a new code
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
            <a href="/recovery">Forgot your password?</a>
          </p>
        )}
        <p>
          {mode === "sign-up"
            ? "Already have an account?"
            : "New to The Family Fund App?"}{" "}
          <a href={mode === "sign-up" ? "/sign-in" : "/sign-up"}>
            {mode === "sign-up" ? "Sign in" : "Create an account"}
          </a>
        </p>
      </section>
    </IdentityFrame>
  );
}
