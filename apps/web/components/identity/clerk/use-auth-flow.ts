"use client";

import { useClerk, useSignIn, useSignUp } from "@clerk/nextjs";
import { useEffect, useRef, useState } from "react";
import { announceSessionChange } from "../client";
import {
  authContinuation,
  type AuthTransition,
} from "../../../lib/auth-continuation";
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

import { useResendCooldown } from "./use-resend-cooldown";

import type { AuthMode } from "../auth-content";
export function continuation(path: AuthTransition): string {
  return authContinuation(path, window.location.search);
}
export function useClerkAuthFlow(mode: AuthMode) {
  const clerk = useClerk();
  const { signIn, fetchStatus: signingIn } = useSignIn();
  const { signUp, fetchStatus: signingUp } = useSignUp();
  const [stage, setStage] = useState<ClerkStage>({ step: "credentials" });
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const resumed = useRef(false);
  const running = useRef(false);
  const recoveringAuthenticator = useRef(false);
  const resendCooldown = useResendCooldown();
  async function finalize() {
    const navigate = ({
      session,
      decorateUrl,
    }: {
      session: { currentTask?: { key: string } | null };
      decorateUrl: (url: string) => string;
    }) => {
      announceSessionChange();
      const task = taskPath(session.currentTask?.key);
      const path =
        recoveringAuthenticator.current && task === "/auth/complete"
          ? "/security"
          : task;
      const destination = new URL(continuation(path), window.location.origin);
      if (recoveringAuthenticator.current)
        destination.searchParams.set("recover", "1");
      window.location.assign(
        decorateUrl(destination.pathname + destination.search),
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
    if (next.step === "email") resendCooldown.start();
    if (next.step === "complete") await finalize();
  }
  async function run(action: () => Promise<void>) {
    if (running.current) return false;
    running.current = true;
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
      running.current = false;
      setPending(false);
    }
  }
  useEffect(() => {
    if (resumed.current || clerk.session) return;
    resumed.current = true;
    // Continue SDK attempts after Google callbacks without replaying a password or sending a code on every render.
    const current = mode === "sign-up" ? signUp : signIn;
    if (shouldResumeAuthentication(mode, current.id, current.status))
      void run(advance);
    // The initial SDK attempt is resumed once. Subsequent transitions belong to explicit actions.
  }, []);
  return {
    stage,
    hasExistingSession: Boolean(clerk.session),
    pending: pending || signingIn === "fetching" || signingUp === "fetching",
    error,
    notice,
    resendSeconds: resendCooldown.seconds,
    backupAvailable: signIn.supportedSecondFactors.some(
      (factor) => factor.strategy === "backup_code",
    ),
    restart: () =>
      run(async () => {
        checked(await (mode === "sign-up" ? signUp.reset() : signIn.reset()));
        recoveringAuthenticator.current = false;
        setStage({ step: "credentials" });
      }),
    submit: (
      email: string,
      password: string,
      code: string,
      backupCode = false,
      username = "",
    ) =>
      run(async () => {
        if (stage.step === "credentials") {
          if (mode === "sign-up")
            checked(await signUp.password({ emailAddress: email, password }));
          else if (mode === "recovery") {
            checked(await signIn.create({ identifier: email }));
            checked(await signIn.resetPasswordEmailCode.sendCode());
            resendCooldown.start();
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
        } else if (stage.step === "mfa") {
          checked(
            await (backupCode
              ? signIn.mfa.verifyBackupCode({ code })
              : signIn.mfa.verifyTOTP({ code })),
          );
          recoveringAuthenticator.current = backupCode;
        } else if (stage.step === "username") {
          checked(await signUp.update({ username: username.trim() }));
        } else if (stage.step === "password") {
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
        if (stage.step !== "email" || !resendCooldown.canResend()) return;
        if (stage.kind === "signup")
          checked(await signUp.verifications.sendEmailCode());
        else if (stage.kind === "device")
          checked(await signIn.mfa.sendEmailCode());
        else checked(await signIn.resetPasswordEmailCode.sendCode());
        resendCooldown.start();
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
