import { useClerk, useSignIn, useSignUp } from "@clerk/expo";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  advanceSignIn,
  advanceSignUp,
  checked,
  ClerkFlowFailure,
  clerkFlowError,
} from "@joint/identity-runtime";
import { useIdentity } from "./context";
import type { AuthMode } from "./workflow";
export type { AuthMode } from "./workflow";
export function useNativeAuthFlow(mode: AuthMode) {
  const clerk = useClerk(),
    { workflow } = useIdentity();
  const { signIn, fetchStatus: signingIn } = useSignIn(),
    { signUp, fetchStatus: signingUp } = useSignUp();
  useSyncExternalStore(
    workflow.subscribe,
    workflow.getSnapshot,
    workflow.getSnapshot,
  );
  const resource = mode === "sign-up" ? signUp : signIn;
  const stage = workflow.stage(mode, resource);
  const [pending, setPending] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const [, tick] = useState(0);
  const running = useRef(false),
    mounted = useRef(true);
  const resendAt = workflow.resendAt(mode, resource.id);
  useEffect(() => {
    mounted.current = true;
    workflow.openAuth(mode);
    return () => {
      mounted.current = false;
    };
  }, [workflow, mode]);
  useEffect(() => {
    if (resendAt <= Date.now()) return;
    const timer = setTimeout(
      () => tick((value) => value + 1),
      Math.max(0, resendAt - Date.now()),
    );
    return () => clearTimeout(timer);
  }, [resendAt]);
  async function run(
    action: (active: () => boolean, current: () => boolean) => Promise<void>,
  ) {
    if (running.current) return false;
    running.current = true;
    setPending(true);
    setError("");
    setNotice("");
    const lease = workflow.capture(),
      previousSession = clerk.session?.id;
    const current = () =>
      lease.current() && clerk.session?.id === previousSession;
    const active = () => mounted.current && lease.active() && current();
    try {
      if (!active()) return false;
      await action(active, current);
      return active();
    } catch (cause) {
      if (active())
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
  async function finalize(active: () => boolean): Promise<void> {
    if (!active()) return;
    // Clerk calls navigate after its internal reload/touch awaits and immediately before activation.
    const navigate = () => {
      if (!active())
        throw new ClerkFlowFailure("Return to sign-in to continue.");
    };
    checked(
      await (mode === "sign-up"
        ? signUp.finalize({ navigate })
        : signIn.finalize({ navigate })),
    );
  }
  async function advance(
    active: () => boolean,
    current: () => boolean,
  ): Promise<void> {
    if (!active()) return;
    const next = await (mode === "sign-up"
      ? advanceSignUp(signUp)
      : advanceSignIn(signIn));
    if (current() && next.step === "email")
      workflow.rememberEmail(mode, resource.id, next.kind, true);
    if (active() && next.step === "complete") await finalize(active);
  }
  async function sendEmail(
    kind: "signup" | "device" | "recovery",
    active: () => boolean,
    current: () => boolean,
  ): Promise<void> {
    if (!active()) return;
    checked(
      await (kind === "signup"
        ? signUp.verifications.sendEmailCode()
        : kind === "device"
          ? signIn.mfa.sendEmailCode()
          : signIn.resetPasswordEmailCode.sendCode()),
    );
    if (current()) workflow.rememberEmail(mode, resource.id, kind, true);
  }
  return {
    stage,
    pending: pending || signingIn === "fetching" || signingUp === "fetching",
    error,
    notice,
    resendReady: Date.now() >= resendAt,
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
      run(async (active, current) => {
        if (stage.step === "complete") {
          await finalize(active);
          return;
        }
        if (stage.step === "email-request") {
          await sendEmail(stage.kind, active, current);
          return;
        }
        if (stage.step === "credentials") {
          if (mode === "sign-up")
            checked(await signUp.password({ emailAddress: email, password }));
          else if (mode === "recovery") {
            checked(await signIn.create({ identifier: email }));
            if (current())
              workflow.rememberEmail(mode, signIn.id, "recovery", false);
            if (active()) await sendEmail("recovery", active, current);
            return;
          } else
            checked(await signIn.password({ emailAddress: email, password }));
        } else if (stage.step === "email")
          checked(
            await (stage.kind === "signup"
              ? signUp.verifications.verifyEmailCode({ code })
              : stage.kind === "device"
                ? signIn.mfa.verifyEmailCode({ code })
                : signIn.resetPasswordEmailCode.verifyCode({ code })),
          );
        else if (stage.step === "mfa")
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
        if (active()) await advance(active, current);
      }),
    restart: () =>
      run(async (active) => {
        if (!active()) return;
        checked(await (mode === "sign-up" ? signUp.reset() : signIn.reset()));
        if (active()) workflow.abandonAuth();
      }),
    resend: () =>
      run(async (active, current) => {
        if (
          stage.step !== "email" ||
          Date.now() < workflow.resendAt(mode, resource.id)
        )
          return;
        await sendEmail(stage.kind, active, current);
        if (active())
          setNotice("A new code was sent. Use the most recent email.");
      }),
  };
}
