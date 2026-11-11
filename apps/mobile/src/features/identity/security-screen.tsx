import { useClerk, useUser } from "@clerk/expo";
import { useLayoutEffect, useState, useSyncExternalStore } from "react";
import * as Linking from "expo-linking";
import { getTotpSetupUri } from "@joint/identity-runtime";
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
    [code, setCode] = useState("");
  const currentSetup = enrollmentPending && setup?.active() ? setup : null;
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
    });
  }, [identity.workflow]);
  async function enroll() {
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
    if (!/^\d{6}$/.test(code)) {
      operation.setError("Enter the six-digit authenticator code.");
      return;
    }
    await operation.run(async (signal, lifetime) => {
      if (!user) throw new Error();
      if (enrollmentPending) {
        await user.verifyTOTP({ code });
        if (lifetime.current()) identity.workflow.setEnrollmentPending(false);
        if (!lifetime.active()) return;
        setSetup(null);
        setCode("");
        await user.reload();
        if (!lifetime.active()) return;
        await clerk.session?.reload();
        if (!lifetime.active()) return;
        operation.setNotice(
          "Authenticator enabled. Wait for the next code, then verify this session.",
        );
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
            disabled={operation.pending}
            onPress={() => void enroll()}
          />
        )}
        {operation.error && (
          <NativeAction
            label="Refresh security"
            tone="secondary"
            disabled={operation.pending}
            onPress={() =>
              void operation.run(async (_signal, lifetime) => {
                await user?.reload();
                if (!lifetime.active()) return;
                await clerk.session?.reload();
                if (lifetime.active()) {
                  if (user?.totpEnabled)
                    identity.workflow.setEnrollmentPending(false);
                  await identity.refresh();
                }
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
