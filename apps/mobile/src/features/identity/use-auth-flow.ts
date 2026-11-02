import { useClerk, useSignIn, useSignUp } from "@clerk/expo";
import { useEffect, useRef, useState } from "react";
import {
  advanceSignIn,
  advanceSignUp,
  checked,
  ClerkFlowFailure,
  clerkFlowError,
  shouldResumeAuthentication,
  type ClerkStage,
} from "@joint/identity-runtime";
export type AuthMode = "sign-in" | "sign-up" | "recovery";
export function useNativeAuthFlow(mode: AuthMode) {
  const clerk = useClerk();
  const { signIn, fetchStatus: signingIn } = useSignIn();
  const { signUp, fetchStatus: signingUp } = useSignUp();
  const [stage, setStage] = useState<ClerkStage>({ step: "credentials" });
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [resendReady, setResendReady] = useState(false);
  const running = useRef(false),
    mounted = useRef(true);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  function cooldown() {
    setResendReady(false);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setResendReady(true), 30000);
  }
  async function advance() {
    const next = await (mode === "sign-up"
      ? advanceSignUp(signUp)
      : advanceSignIn(signIn));
    if (!mounted.current) return;
    setStage(next);
    if (next.step === "email") cooldown();
    if (next.step === "complete")
      checked(
        await (mode === "sign-up" ? signUp.finalize() : signIn.finalize()),
      );
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
      if (mounted.current)
        setError(
          cause instanceof ClerkFlowFailure
            ? cause.message
            : clerkFlowError(cause),
        );
      return false;
    } finally {
      running.current = false;
      if (mounted.current) setPending(false);
    }
  }
  useEffect(() => {
    mounted.current = true;
    const current = mode === "sign-up" ? signUp : signIn;
    if (
      !clerk.session &&
      shouldResumeAuthentication(mode, current.id, current.status)
    )
      void run(advance);
    return () => {
      mounted.current = false;
      clearTimeout(timer.current);
    };
  }, []);
  return {
    stage,
    pending: pending || signingIn === "fetching" || signingUp === "fetching",
    error,
    notice,
    resendReady,
    backupAvailable: signIn.supportedSecondFactors.some(
      (f) => f.strategy === "backup_code",
    ),
    submit: (
      email: string,
      password: string,
      code: string,
      backup: boolean,
      username: string,
    ) =>
      run(async () => {
        if (stage.step === "credentials") {
          if (mode === "sign-up")
            checked(await signUp.password({ emailAddress: email, password }));
          else if (mode === "recovery") {
            checked(await signIn.create({ identifier: email }));
            checked(await signIn.resetPasswordEmailCode.sendCode());
            if (mounted.current) {
              setStage({ step: "email", kind: "recovery" });
              cooldown();
            }
            return;
          } else
            checked(await signIn.password({ emailAddress: email, password }));
        } else if (stage.step === "email") {
          checked(
            await (stage.kind === "signup"
              ? signUp.verifications.verifyEmailCode({ code })
              : stage.kind === "device"
                ? signIn.mfa.verifyEmailCode({ code })
                : signIn.resetPasswordEmailCode.verifyCode({ code })),
          );
        } else if (stage.step === "mfa")
          checked(
            await (backup
              ? signIn.mfa.verifyBackupCode({ code })
              : signIn.mfa.verifyTOTP({ code })),
          );
        else if (stage.step === "username")
          checked(await signUp.update({ username: username.trim() }));
        else if (stage.step === "password")
          checked(
            await (mode === "sign-up"
              ? signUp.password({ password })
              : signIn.resetPasswordEmailCode.submitPassword({
                  password,
                  signOutOfOtherSessions: true,
                })),
          );
        await advance();
      }),
    restart: () =>
      run(async () => {
        checked(await (mode === "sign-up" ? signUp.reset() : signIn.reset()));
        if (mounted.current) setStage({ step: "credentials" });
      }),
    resend: () =>
      run(async () => {
        if (stage.step !== "email" || !resendReady) return;
        checked(
          await (stage.kind === "signup"
            ? signUp.verifications.sendEmailCode()
            : stage.kind === "device"
              ? signIn.mfa.sendEmailCode()
              : signIn.resetPasswordEmailCode.sendCode()),
        );
        if (mounted.current) {
          cooldown();
          setNotice("A new code was sent. Use the most recent email.");
        }
      }),
  };
}
