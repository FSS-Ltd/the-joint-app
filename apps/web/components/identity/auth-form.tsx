"use client";

import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import {
  errorMessage,
  finishAuth,
  nextDestination,
  request,
  type Identity,
} from "./client";
import { Feedback, IdentityFrame } from "./frame";

type Mode = "sign-in" | "sign-up" | "recovery";
type Stage = "credentials" | "verify" | "password";
const content = {
  "sign-in": {
    eyebrow: "Welcome back",
    title: "Make room for together.",
    description: "Sign in to your household, with a little space for yourself.",
    heading: "Sign in",
    action: "Sign in",
  },
  "sign-up": {
    eyebrow: "A fresh start",
    title: "Better, together.",
    description: "Create your account. Then make a home for your shared plans.",
    heading: "Create your account",
    action: "Create account",
  },
  recovery: {
    eyebrow: "Here to help",
    title: "Find your way back.",
    description: "A few small steps to safely return to your account.",
    heading: "Reset your password",
    action: "Send recovery code",
  },
};

export function AuthForm({ mode }: { mode: Mode }): ReactNode {
  const [stage, setStage] = useState<Stage>("credentials");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [ready, setReady] = useState(false);
  const [next, setNext] = useState<"join" | "accounts" | null>(null);
  const text = content[mode];
  useEffect(() => {
    let current = true;
    setReady(false);
    const destination = nextDestination();
    setNext(
      destination === "/join"
        ? "join"
        : destination === "/accounts"
          ? "accounts"
          : null,
    );
    if (mode !== "recovery") {
      setReady(true);
      return;
    }
    void request<Identity>("/api/me")
      .then((me) => {
        if (!current) return;
        if (me.session.purpose === "RECOVERY") {
          if (me.session.needsMfa) {
            window.location.replace(
              `/security?recovery=1${nextDestination() === "/household" ? "" : `&next=${nextDestination().slice(1)}`}`,
            );
            return;
          }
          setStage("password");
        }
        setReady(true);
      })
      .catch(() => {
        /* A signed-out recovery begins with an email address. */
        if (current) setReady(true);
      });
    return () => {
      current = false;
    };
  }, [mode]);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!ready || pending) return;
    setPending(true);
    setError("");
    try {
      if (stage === "password") {
        await request("/api/auth/password", { password });
        setPassword("");
        window.location.assign(nextDestination());
      } else if (stage === "verify") {
        const result = await request<{ state: string }>("/api/auth/verify", {
          email,
          code,
          type: mode === "recovery" ? "recovery" : "signup",
        });
        setCode("");
        if (result.state === "PASSWORD_RESET_REQUIRED") setStage("password");
        else if (mode === "recovery" && result.state === "MFA_REQUIRED")
          window.location.assign(
            `/security?recovery=1${next ? `&next=${next}` : ""}`,
          );
        else finishAuth(result.state);
      } else {
        const endpoint =
          mode === "sign-in"
            ? "login"
            : mode === "sign-up"
              ? "signup"
              : "recovery";
        const result = await request<{ state: string }>(
          `/api/auth/${endpoint}`,
          mode === "recovery" ? { email } : { email, password },
        );
        setPassword("");
        if (result.state === "VERIFY_EMAIL") setStage("verify");
        else finishAuth(result.state);
      }
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setPending(false);
    }
  }
  const disabled = !ready || pending;
  const suffix = next ? `?next=${next}` : "";
  return (
    <IdentityFrame {...text}>
      <section className="surface form-card" aria-labelledby="form-title">
        <p className="step-label">
          {stage === "verify"
            ? "Check your inbox"
            : stage === "password"
              ? "One last step"
              : "Your private account"}
        </p>
        <h2 id="form-title">
          {stage === "verify"
            ? "Verify your email"
            : stage === "password"
              ? "Choose a new password"
              : text.heading}
        </h2>
        {stage === "verify" && (
          <p>
            Enter the code sent to{" "}
            <strong className="break-word">{email}</strong>. Local emails appear
            in the development mail inbox.
          </p>
        )}
        <form onSubmit={submit} className="form-stack" aria-busy={disabled}>
          {stage === "credentials" && (
            <label>
              Email address
              <input
                disabled={disabled}
                type="email"
                autoComplete="email"
                required
                maxLength={254}
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </label>
          )}
          {(stage === "password" ||
            (stage === "credentials" && mode !== "recovery")) && (
            <label>
              {stage === "password" ? "New password" : "Password"}
              <input
                disabled={disabled}
                type="password"
                autoComplete={
                  mode === "sign-in" && stage === "credentials"
                    ? "current-password"
                    : "new-password"
                }
                required
                minLength={mode === "sign-in" ? 1 : 12}
                maxLength={128}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                aria-describedby="password-hint"
              />
              <span className="field-hint" id="password-hint">
                {mode === "sign-in"
                  ? "Use the password for your Joint App account."
                  : "Use 12–128 characters. A longer phrase works well."}
              </span>
            </label>
          )}
          {stage === "verify" && (
            <label>
              Email verification code
              <input
                disabled={disabled}
                autoComplete="one-time-code"
                required
                maxLength={20}
                value={code}
                onChange={(event) => setCode(event.target.value.trim())}
              />
            </label>
          )}
          <Feedback error={error} />
          <button className="button primary" disabled={disabled} type="submit">
            {!ready
              ? "Preparing your account…"
              : pending
                ? "Please wait…"
                : stage === "verify"
                  ? "Verify email"
                  : stage === "password"
                    ? "Save new password"
                    : text.action}
            <span aria-hidden="true">↗</span>
          </button>
        </form>
        {stage === "verify" && (
          <button
            className="text-button"
            type="button"
            disabled={disabled}
            onClick={() => {
              setStage("credentials");
              setCode("");
              setError("");
            }}
          >
            Use a different email
          </button>
        )}
        {mode === "sign-in" && stage === "credentials" && (
          <a
            className="form-link"
            href={ready ? `/recovery${suffix}` : undefined}
            aria-disabled={!ready}
          >
            Forgot your password?
          </a>
        )}
        <div className="form-divider" />
        <p className="form-footnote">
          {mode === "sign-up"
            ? "Already have an account?"
            : "New to The Joint App?"}{" "}
          <a
            href={
              ready
                ? `/${mode === "sign-up" ? "sign-in" : "sign-up"}${suffix}`
                : undefined
            }
            aria-disabled={!ready}
          >
            {mode === "sign-up" ? "Sign in" : "Create an account"}
          </a>
        </p>
        {mode === "recovery" && (
          <a
            className="form-link"
            href={ready ? `/sign-in${suffix}` : undefined}
            aria-disabled={!ready}
          >
            Back to sign in
          </a>
        )}
      </section>
      <p className="privacy-note">
        Your account stays personal. Household access begins when you create or
        accept an invitation.
      </p>
    </IdentityFrame>
  );
}
