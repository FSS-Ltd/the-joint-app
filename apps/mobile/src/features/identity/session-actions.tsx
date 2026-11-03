import { Alert } from "react-native";
import { NativeAction } from "@/components/native-action";
import { NativeActions } from "@/components/native-actions";
import { Feedback } from "@/components/identity-frame";
import { useIdentity } from "./context";
export function SessionActions(): React.JSX.Element {
  const identity = useIdentity();
  const pending = identity.sessionPending;
  if (identity.cancelPendingSignIn)
    return (
      <>
        <Feedback
          error={identity.sessionError}
          notice={identity.sessionNotice}
        />
        <NativeActions>
          <NativeAction
            label="Cancel sign-in"
            tone="text"
            pending={pending}
            onPress={() => void identity.cancelPendingSignIn?.()}
          />
        </NativeActions>
      </>
    );
  return (
    <>
      <Feedback error={identity.sessionError} notice={identity.sessionNotice} />
      <NativeActions>
        {identity.state.kind !== "signed-out" && (
          <>
            <NativeAction
              label="Sign out on this device"
              tone="text"
              pending={pending}
              onPress={() => void identity.logout("local")}
            />
            <NativeAction
              label="Sign out everywhere"
              tone="text"
              disabled={pending}
              onPress={() =>
                Alert.alert(
                  "Sign out everywhere?",
                  "This ends your app sessions on every device.",
                  [
                    { text: "Cancel", style: "cancel" },
                    {
                      text: "Sign out everywhere",
                      style: "destructive",
                      onPress: () => void identity.logout("global"),
                    },
                  ],
                )
              }
            />
          </>
        )}
        {identity.discardRejectedSignIn && (
          <NativeAction
            label="Remove this device’s rejected sign-in"
            tone="text"
            disabled={pending}
            onPress={() =>
              Alert.alert(
                "Remove this device’s sign-in?",
                "Server and other-device sign-out are not confirmed. This removes the rejected credential so you can sign in again.",
                [
                  { text: "Cancel", style: "cancel" },
                  {
                    text: "Remove sign-in",
                    style: "destructive",
                    onPress: () => void identity.discardRejectedSignIn?.(),
                  },
                ],
              )
            }
          />
        )}
        {identity.cleanupPending && (
          <NativeAction
            label="Finish sign-out cleanup"
            disabled={pending}
            onPress={() => void identity.retryCleanup()}
          />
        )}
      </NativeActions>
    </>
  );
}
