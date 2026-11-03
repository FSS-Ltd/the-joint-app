import { useClerk, useUser } from "@clerk/expo";
import { useState, useSyncExternalStore } from "react";
import { AppText } from "@/components/app-text";
import { Feedback, IdentityFrame } from "@/components/identity-frame";
import { NativeField } from "@/components/native-field";
import { NativeAction } from "@/components/native-action";
import { NativeActions } from "@/components/native-actions";
import { SessionActions } from "./session-actions";
import { useIdentity } from "./context";
import { useIdentityOperation } from "./use-operation";

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
  const [secret, setSecret] = useState(""),
    [code, setCode] = useState("");
  const [showKey, setShowKey] = useState(false);
  async function enroll() {
    await operation.run(async (_signal, lifetime) => {
      if (!user) throw new Error();
      const enrollment = await user.createTOTP();
      if (!enrollment.secret) throw new Error();
      if (lifetime.current()) identity.workflow.setEnrollmentPending(true);
      if (lifetime.active()) {
        setSecret(enrollment.secret);
        setCode("");
        setShowKey(false);
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
        setSecret("");
        setCode("");
        setShowKey(false);
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
        await identity.refresh();
        if (lifetime.active()) onBack?.();
      }
    });
  }
  return (
    <IdentityFrame
      title="A little extra peace of mind."
      description="Use your own authenticator to protect your household."
    >
      <Feedback error={operation.error} notice={operation.notice} />
      <AppText>
        Email verification and backup codes do not replace a fresh authenticator
        check for household access.
      </AppText>
      {secret && (
        <>
          <AppText>
            Add The Family Fund App in your authenticator. Choose a time-based
            code and enter this private setup key.
          </AppText>
          {showKey && (
            <AppText
              selectable
              accessibilityLabel={`Private setup key: ${secret}`}
            >
              {secret}
            </AppText>
          )}
          <NativeActions>
            <NativeAction
              label={showKey ? "Hide setup key" : "Show private setup key"}
              onPress={() => setShowKey(!showKey)}
            />
          </NativeActions>
        </>
      )}
      {(user?.totpEnabled || enrollmentPending) && (
        <NativeField
          label="Authenticator code"
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
        ) : (
          <NativeAction
            label={
              enrollmentPending ? "Enable authenticator" : "Verify this session"
            }
            pending={operation.pending}
            onPress={() => void verify()}
          />
        )}
        {enrollmentPending && !secret && (
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
