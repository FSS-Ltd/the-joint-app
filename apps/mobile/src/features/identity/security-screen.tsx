import { useClerk, useUser } from "@clerk/expo";
import { useState } from "react";
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
  const [secret, setSecret] = useState(""),
    [code, setCode] = useState("");
  const [showKey, setShowKey] = useState(false);
  async function enroll() {
    await operation.run(async (signal) => {
      if (!user) throw new Error();
      const enrollment = await user.createTOTP();
      if (!enrollment.secret) throw new Error();
      if (!signal.aborted) setSecret(enrollment.secret);
    });
  }
  async function verify() {
    if (!/^\d{6}$/.test(code)) {
      operation.setError("Enter the six-digit authenticator code.");
      return;
    }
    await operation.run(async (signal) => {
      if (!user) throw new Error();
      if (secret) {
        await user.verifyTOTP({ code });
        if (signal.aborted) return;
        setSecret("");
        setCode("");
        setShowKey(false);
        await user.reload();
        await clerk.session?.reload();
        operation.setNotice(
          "Authenticator enabled. Wait for the next code, then verify this session.",
        );
      } else {
        await clerk.session?.getToken({ skipCache: true });
        if (signal.aborted) return;
        await identity.api.verifyTotp(code, signal);
        if (signal.aborted) return;
        setCode("");
        await identity.refresh();
        onBack?.();
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
      {(user?.totpEnabled || secret) && (
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
        {!user?.totpEnabled && !secret ? (
          <NativeAction
            label="Set up authenticator"
            pending={operation.pending}
            onPress={() => void enroll()}
          />
        ) : (
          <NativeAction
            label={secret ? "Enable authenticator" : "Verify this session"}
            pending={operation.pending}
            onPress={() => void verify()}
          />
        )}
        {operation.error && (
          <NativeAction
            label="Refresh security"
            tone="secondary"
            disabled={operation.pending}
            onPress={() =>
              void operation.run(async (signal) => {
                await user?.reload();
                if (signal.aborted) return;
                await clerk.session?.reload();
                if (!signal.aborted) await identity.refresh();
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
