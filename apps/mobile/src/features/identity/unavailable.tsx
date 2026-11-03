import { IdentityFrame } from "@/components/identity-frame";
import { AppText } from "@/components/app-text";
export function IdentityUnavailable(): React.JSX.Element {
  return (
    <IdentityFrame
      title="Sign-in is unavailable"
      description="Your household stays private."
    >
      <AppText>
        Secure sign-in could not start. Close and reopen the app, then try
        again.
      </AppText>
    </IdentityFrame>
  );
}
