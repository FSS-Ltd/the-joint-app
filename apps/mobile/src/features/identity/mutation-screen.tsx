import { useSignIn, useSignUp } from "@clerk/expo";
import { checked } from "@joint/identity-runtime";
import { useState, useSyncExternalStore } from "react";
import { AppText } from "@/components/app-text";
import { Feedback, IdentityFrame } from "@/components/identity-frame";
import { NativeAction } from "@/components/native-action";
import { NativeActions } from "@/components/native-actions";
import { useIdentity } from "./context";
export function MutationScreen(): React.JSX.Element {
  const { mutations, workflow } = useIdentity();
  const { signIn } = useSignIn(),
    { signUp } = useSignUp();
  const state = useSyncExternalStore(
    mutations.subscribe,
    mutations.getSnapshot,
    mutations.getSnapshot,
  );
  const [error, setError] = useState("");
  async function select(startOver: boolean): Promise<void> {
    setError("");
    try {
      if (startOver)
        await mutations.restart(async (current) => {
          checked(await signIn.reset());
          if (!current()) return;
          checked(await signUp.reset());
          if (current()) workflow.abandonAuth();
        });
      else await mutations.reselect();
    } catch {
      setError(
        "That sign-in could not be selected. Start again or retry when your connection returns.",
      );
    }
  }
  return (
    <IdentityFrame
      title={
        state.quarantined ? "Your sign-in changed." : "Securing your sign-in…"
      }
      description={
        state.quarantined
          ? "Select the latest sign-in or start a fresh authentication attempt on this device. Starting again does not confirm server or other-device sign-out."
          : "Your account stays concealed until this check finishes."
      }
    >
      <Feedback error={error} />
      {state.busy ? (
        <AppText accessibilityLiveRegion="polite">
          {state.slow
            ? "The sign-in service is taking longer than expected. This transition must finish before another can start."
            : "Please wait."}
        </AppText>
      ) : (
        <NativeActions>
          <NativeAction
            label="Continue with the latest sign-in"
            onPress={() => void select(false)}
          />
          <NativeAction
            label="Start sign-in again"
            tone="text"
            onPress={() => void select(true)}
          />
        </NativeActions>
      )}
    </IdentityFrame>
  );
}
