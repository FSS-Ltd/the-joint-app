import { useState } from "react";
import { getTotpSetupUri } from "@joint/identity-runtime";
import { AppText } from "@/components/app-text";
import { NativeAction } from "@/components/native-action";
import { NativeActions } from "@/components/native-actions";
import { AuthenticatorQrCode } from "./authenticator-qr-code";

export type AuthenticatorSetup = { secret: string; uri: string | null };

export function AuthenticatorEnrollment({
  setup,
  pending,
  onOpen,
  onContinue,
}: {
  setup: AuthenticatorSetup;
  pending: boolean;
  onOpen(uri: string): void;
  onContinue(): void;
}): React.JSX.Element {
  const [showKey, setShowKey] = useState(false);
  const uri = getTotpSetupUri(setup.uri, setup.secret);
  return (
    <>
      <AppText>Private setup · Do not share this QR code or key.</AppText>
      {uri && (
        <AppText>
          Open your authenticator on this device, or scan the QR code from
          another device.
        </AppText>
      )}
      {uri ? (
        <AuthenticatorQrCode value={uri} />
      ) : (
        <AppText accessibilityLiveRegion="polite">
          QR setup is unavailable. Use the private manual setup key below.
        </AppText>
      )}
      <NativeActions>
        <NativeAction
          label="Enter authenticator code"
          disabled={pending}
          onPress={onContinue}
        />
        {uri && (
          <NativeAction
            label="Open authenticator"
            tone="secondary"
            pending={pending}
            onPress={() => onOpen(uri)}
          />
        )}
        <NativeAction
          label={showKey ? "Hide setup key" : "Show private setup key"}
          tone="secondary"
          disabled={pending}
          onPress={() => setShowKey(!showKey)}
        />
      </NativeActions>
      {showKey && (
        <>
          <AppText>
            Add The Family Fund App in your authenticator. Choose a time-based
            code and enter this private setup key.
          </AppText>
          <AppText
            selectable
            accessibilityLabel={`Private setup key: ${setup.secret}`}
          >
            {setup.secret}
          </AppText>
        </>
      )}
    </>
  );
}
