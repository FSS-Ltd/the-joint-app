import { isClerkAPIResponseError, useClerk, useUser } from "@clerk/expo";
import { useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import * as Linking from "expo-linking";
import { getTotpSetupUri } from "@joint/identity-runtime";
import { AppText } from "@/components/app-text";
import { Feedback, IdentityFrame } from "@/components/identity-frame";
import { NativeField } from "@/components/native-field";
import { NativeAction } from "@/components/native-action";
import { NativeActions } from "@/components/native-actions";
import { SessionActions } from "./session-actions";
import { useIdentity } from "./context";
import { useIdentityOperation } from "./use-operation";
import {
  AuthenticatorEnrollment,
  type AuthenticatorSetup,
} from "./authenticator-enrollment";

export function SecurityScreen({
  onBack,
}: {
  onBack?: () => void;
}): React.JSX.Element {
  const { user } = useUser(),
    clerk = useClerk(),
    identity = useIdentity(),
    operation = useIdentityOperation();
  useSyncExternalStore(
    identity.workflow.subscribe,
    identity.workflow.getSnapshot,
    identity.workflow.getSnapshot,
  );
  const enrollmentPending = identity.workflow.enrollmentPending;
  const [setup, setSetup] = useState<{
      material: AuthenticatorSetup;
      active(): boolean;
    } | null>(null),
    [codeStep, setCodeStep] = useState(false),
    [code, setCode] = useState(""),
    [recoveryRequired, setRecoveryRequired] = useState(false),
    [reconciled, setReconciled] = useState(false);
  const needsRefresh = useRef(false);
  const currentSetup = enrollmentPending && setup?.active() ? setup : null;
  const requiresReconcile =
    recoveryRequired || (enrollmentPending && !currentSetup && !reconciled);
  const showSetup = currentSetup !== null && !codeStep;
  const showCode = !showSetup && (enrollmentPending || user?.totpEnabled);
  useLayoutEffect(() => {
    let actor = identity.workflow.capture();
    return identity.workflow.subscribe(() => {
      if (actor.current()) return;
      actor = identity.workflow.capture();
      setSetup(null);
      setCodeStep(false);
      setCode("");
      needsRefresh.current = false;
      setRecoveryRequired(false);
      setReconciled(false);
    });
  }, [identity.workflow]);
  async function enroll() {
    if (
      needsRefresh.current ||
      (enrollmentPending && !currentSetup && !reconciled)
    )
      return;
    await operation.run(async (_signal, lifetime) => {
      if (!user) throw new Error();
      const enrollment = await user.createTOTP();
      if (!enrollment.secret) throw new Error();
      if (lifetime.current()) identity.workflow.setEnrollmentPending(true);
      if (lifetime.active()) {
        setCodeStep(false);
        setSetup({
          material: {
            secret: enrollment.secret,
            uri: getTotpSetupUri(enrollment.uri, enrollment.secret),
          },
          active: lifetime.active,
        });
        setCode("");
      }
    });
  }
  async function openAuthenticator(uri: string) {
    if (!setup?.active() || uri !== setup.material.uri) return;
    await operation.run(async (_signal, lifetime) => {
      try {
        await Linking.openURL(uri);
        if (lifetime.active()) setCodeStep(true);
      } catch {
        if (lifetime.active())
          operation.setNotice(
            "Could not open an authenticator. Scan the QR code from another device or use the private manual setup key.",
          );
      }
    });
  }
  async function verify() {
    if (
      needsRefresh.current ||
      (enrollmentPending && !currentSetup && !reconciled)
    )
      return;
    if (!/^\d{6}$/.test(code)) {
      operation.setError("Enter the six-digit authenticator code.");
      return;
    }
    await operation.run(async (signal, lifetime) => {
      if (!user) throw new Error();
      if (enrollmentPending) {
        needsRefresh.current = true;
        setRecoveryRequired(true);
        try {
          await user.verifyTOTP({ code });
        } catch (error) {
          if (
            isClerkAPIResponseError(error) &&
            error.status === 422 &&
            error.errors.length > 0 &&
            error.errors.every(
              (detail) => detail.code === "form_code_incorrect",
            )
          ) {
            needsRefresh.current = false;
            if (lifetime.active()) setRecoveryRequired(false);
          }
          throw error;
        }
        if (!lifetime.active()) return;
        setSetup(null);
        setCode("");
        await user.reload();
        if (!lifetime.active()) return;
        const session = clerk.session;
        if (!session) throw new Error("Session unavailable");
        await session.reload();
        if (!lifetime.active()) return;
        const token = await session.getToken({ skipCache: true });
        if (!lifetime.active()) return;
        if (!token || !user.totpEnabled)
          throw new Error("Security refresh incomplete");
        identity.workflow.setEnrollmentPending(false);
        needsRefresh.current = false;
        setRecoveryRequired(false);
        onBack?.();
        await identity.refresh();
      } else {
        await clerk.session?.getToken({ skipCache: true });
        if (!lifetime.active()) return;
        await identity.api.verifyTotp(code, signal);
        if (!lifetime.active()) return;
        setCode("");
        onBack?.();
        await identity.refresh();
      }
    });
  }
  return (
    <IdentityFrame
      key={showCode ? "code" : "setup"}
      title={
        showCode ? "Enter your authenticator code" : "Set up an authenticator"
      }
      description={
        showCode
          ? "Enter the six-digit code shown in your authenticator app."
          : "Add The Family Fund App to your authenticator to protect your household."
      }
    >
      <Feedback error={operation.error} notice={operation.notice} />
      {requiresReconcile && (
        <AppText>
          Refresh security before trying another code. Your authenticator may
          already be enabled.
        </AppText>
      )}
      {showSetup && (
        <AuthenticatorEnrollment
          setup={currentSetup.material}
          pending={operation.pending}
          onOpen={(uri) => void openAuthenticator(uri)}
          onContinue={() => {
            if (!currentSetup.active()) return;
            operation.setNotice("");
            setCodeStep(true);
          }}
        />
      )}
      {showCode && (
        <NativeField
          label="Authenticator code"
          autoFocus={enrollmentPending}
          value={code}
          onChangeText={(value) => {
            identity.interact();
            setCode(value);
          }}
          keyboardType="number-pad"
          autoComplete="one-time-code"
          maxLength={6}
          editable={!operation.pending}
        />
      )}
      <NativeActions>
        {!user?.totpEnabled && !enrollmentPending ? (
          <NativeAction
            label="Set up authenticator"
            pending={operation.pending}
            onPress={() => void enroll()}
          />
        ) : showCode ? (
          <NativeAction
            label={
              enrollmentPending ? "Enable authenticator" : "Verify this session"
            }
            pending={operation.pending}
            disabled={requiresReconcile}
            onPress={() => void verify()}
          />
        ) : null}
        {showCode && currentSetup && (
          <NativeAction
            label="Back to setup"
            tone="text"
            disabled={operation.pending}
            onPress={() => {
              setCode("");
              operation.setError("");
              setCodeStep(false);
            }}
          />
        )}
        {enrollmentPending && !currentSetup && (
          <NativeAction
            label="Restart authenticator setup"
            tone="text"
            disabled={operation.pending || requiresReconcile}
            onPress={() => void enroll()}
          />
        )}
        {(operation.error || requiresReconcile) && (
          <NativeAction
            label="Refresh security"
            tone="secondary"
            disabled={operation.pending}
            onPress={() =>
              void operation.run(async (_signal, lifetime) => {
                if (!user || !clerk.session)
                  throw new Error("Session unavailable");
                await user.reload();
                if (!lifetime.active()) return;
                const session = clerk.session;
                await session.reload();
                if (!lifetime.active()) return;
                const token = await session.getToken({ skipCache: true });
                if (!lifetime.active()) return;
                if (!token) throw new Error("Session unavailable");
                if (user.totpEnabled) {
                  identity.workflow.setEnrollmentPending(false);
                  setSetup(null);
                  setCode("");
                  onBack?.();
                }
                needsRefresh.current = false;
                setRecoveryRequired(false);
                setReconciled(true);
                await identity.refresh();
              })
            }
          />
        )}
        {onBack && (
          <NativeAction
            label="Back to your account"
            tone="text"
            disabled={operation.pending}
            onPress={onBack}
          />
        )}
      </NativeActions>
      <SessionActions />
    </IdentityFrame>
  );
}
