"use client";

import { useSignIn, useSignUp } from "@clerk/nextjs";
import { useEffect, useRef, useState } from "react";
import { announceSessionChange, nextDestination } from "../client";
import {
  advanceSignIn,
  advanceSignUp,
  checked,
  ClerkFlowFailure,
  clerkFlowError,
  taskPath,
  shouldResumeAuthentication,
  type ClerkStage,
} from "./flow";

import type { AuthMode } from "../auth-content";
export function continuation(path: string): string {
  const next = nextDestination();
  return (
    path +
    (next === "/household"
      ? ""
      : `?next=${next === "/settings/privacy" ? "privacy" : next.slice(1)}`)
  );
}
export function useClerkAuthFlow(mode: AuthMode) {
  const { signIn, fetchStatus: signingIn } = useSignIn();
  const { signUp, fetchStatus: signingUp } = useSignUp();
  const [stage, setStage] = useState<ClerkStage>({ step: "credentials" });
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const resumed = useRef(false);
  async function finalize() {
    const navigate = ({
      session,
      decorateUrl,
    }: {
      session: { currentTask?: { key: string } | null };
      decorateUrl: (url: string) => string;
    }) => {
      announceSessionChange();
      window.location.assign(
        decorateUrl(continuation(taskPath(session.currentTask?.key))),
      );
    };
    checked(
      await (mode === "sign-up"
        ? signUp.finalize({ navigate })
        : signIn.finalize({ navigate })),
    );
  }
  async function advance() {
    const next = await (mode === "sign-up"
      ? advanceSignUp(signUp)
      : advanceSignIn(signIn));
    setStage(next);
    if (next.step === "complete") await finalize();
  }
  async function run(action: () => Promise<void>) {
    if (pending) return false;
    setPending(true);
    setError("");
    setNotice("");
    try {
      await action();
      return true;
    } catch (cause) {
      setError(
        cause instanceof ClerkFlowFailure
          ? cause.message
          : clerkFlowError(cause),
      );
      return false;
    } finally {
      setPending(false);
    }
  }
  useEffect(() => {
    if (resumed.current) return;
    resumed.current = true;
    // Continue SDK attempts after Google callbacks without replaying a password or sending a code on every render.
    const current = mode === "sign-up" ? signUp : signIn;
    if (shouldResumeAuthentication(mode, current.id, current.status))
      void run(advance);
    // The initial SDK attempt is resumed once. Subsequent transitions belong to explicit actions.
  }, []);
  return {
    stage,
    pending: pending || signingIn === "fetching" || signingUp === "fetching",
    error,
    notice,
    restart: () =>
      run(async () => {
        checked(await (mode === "sign-up" ? signUp.reset() : signIn.reset()));
        setStage({ step: "credentials" });
      }),
    submit: (email: string, password: string, code: string) =>
      run(async () => {
        if (stage.step === "credentials") {
          if (mode === "sign-up")
            checked(await signUp.password({ emailAddress: email, password }));
          else if (mode === "recovery") {
            checked(await signIn.create({ identifier: email }));
            checked(await signIn.resetPasswordEmailCode.sendCode());
            setStage({ step: "email", kind: "recovery" });
            return;
          } else
            checked(await signIn.password({ emailAddress: email, password }));
        } else if (stage.step === "email") {
          if (stage.kind === "signup")
            checked(await signUp.verifications.verifyEmailCode({ code }));
          else if (stage.kind === "device")
            checked(await signIn.mfa.verifyEmailCode({ code }));
          else
            checked(await signIn.resetPasswordEmailCode.verifyCode({ code }));
        } else if (stage.step === "mfa")
          checked(await signIn.mfa.verifyTOTP({ code }));
        else if (stage.step === "password") {
          if (mode === "sign-up") checked(await signUp.password({ password }));
          else
            checked(
              await signIn.resetPasswordEmailCode.submitPassword({
                password,
                signOutOfOtherSessions: true,
              }),
            );
        }
        await advance();
      }),
    resend: () =>
      run(async () => {
        if (stage.step !== "email") return;
        if (stage.kind === "signup")
          checked(await signUp.verifications.sendEmailCode());
        else if (stage.kind === "device")
          checked(await signIn.mfa.sendEmailCode());
        else checked(await signIn.resetPasswordEmailCode.sendCode());
        setNotice(
          "A new verification code was sent. Use the most recent email.",
        );
      }),
    google: () =>
      run(async () => {
        const settings = {
          strategy: "oauth_google" as const,
          redirectUrl: continuation("/auth/complete"),
          redirectCallbackUrl: continuation("/auth/callback"),
        };
        checked(
          await (mode === "sign-up"
            ? signUp.sso(settings)
            : signIn.sso(settings)),
        );
      }),
  };
}
