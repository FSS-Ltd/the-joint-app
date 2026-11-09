import { useSyncExternalStore, type ReactNode } from "react";
import type { MeResponse } from "@joint/contracts";
import { MutationScreen } from "./mutation-screen";
import { useSession } from "@clerk/expo";
import { usePathname } from "expo-router";
import { AppText } from "@/components/app-text";
import { IdentityFrame } from "@/components/identity-frame";
import { NativeAction } from "@/components/native-action";
import { NativeActions } from "@/components/native-actions";
import { useIdentity } from "./context";
import { AuthScreen } from "./auth-screen";
import { SecurityScreen } from "./security-screen";
import { PasswordTaskScreen } from "./password-task-screen";
import { AccountScreen } from "./account-screen";
import { SessionActions } from "./session-actions";
import { DeletionReceiptScreen } from "../privacy/deletion-receipt-screen";
export function IdentityEntry({
  ready,
}: { ready?: (me: MeResponse) => ReactNode } = {}): ReactNode {
  const identity = useIdentity(),
    { session } = useSession(),
    path = usePathname();
  const state = identity.state;
  const mutation = useSyncExternalStore(
    identity.mutations.subscribe,
    identity.mutations.getSnapshot,
    identity.mutations.getSnapshot,
  );
  useSyncExternalStore(
    identity.workflow.subscribe,
    identity.workflow.getSnapshot,
    identity.workflow.getSnapshot,
  );
  if (state.kind === "locked" && state.reason === "background")
    return (
      <IdentityFrame
        title="Your account is protected."
        description="Return to the app to continue."
      >
        <SessionActions />
      </IdentityFrame>
    );
  if (
    mutation.quarantined ||
    (mutation.busy &&
      (mutation.phase === "session" || state.kind !== "signed-out"))
  )
    return <MutationScreen />;
  if (identity.workflow.deletionReceipt)
    return (
      <DeletionReceiptScreen
        receipt={identity.workflow.deletionReceipt}
        onClose={() => identity.workflow.setDeletionReceipt(null)}
      />
    );
  const task = session?.currentTask?.key;
  if (task === "reset-password") return <PasswordTaskScreen />;
  if (task === "setup-mfa") return <SecurityScreen />;
  if (task)
    return (
      <IdentityFrame
        title="An account check is needed."
        description="This account has an additional sign-in requirement."
      >
        <AppText>Contact support to complete this requirement.</AppText>
        <SessionActions />
      </IdentityFrame>
    );
  if (state.kind === "loading")
    return (
      <IdentityFrame
        title="Opening your account…"
        description="Checking your secure session."
      >
        <AppText accessibilityLiveRegion="polite">Please wait.</AppText>
      </IdentityFrame>
    );
  if (state.kind === "signed-out" && identity.cleanupPending)
    return (
      <IdentityFrame
        title="Finish signing out."
        description="Your app access is already revoked. Finish provider cleanup before signing in again."
      >
        <SessionActions />
      </IdentityFrame>
    );
  if (state.kind === "signed-out")
    return (
      <AuthScreen
        key={`${path}:${identity.authRevision}`}
        mode={
          path === "/sign-up"
            ? "sign-up"
            : path === "/recovery"
              ? "recovery"
              : "sign-in"
        }
      />
    );
  if (state.kind === "locked")
    return (
      <IdentityFrame
        title={
          state.reason === "expired"
            ? "Time to sign in again."
            : "Your account is protected."
        }
        description={
          state.reason === "expired"
            ? "Your session has ended. Sign out, then sign in again to continue."
            : "We could not verify your access. Check your connection and try again."
        }
      >
        <NativeActions>
          {state.reason !== "expired" && (
            <NativeAction
              label="Try again"
              disabled={identity.sessionPending}
              onPress={() => void identity.refresh()}
            />
          )}
        </NativeActions>
        <SessionActions />
      </IdentityFrame>
    );
  if (state.kind === "security-required") return <SecurityScreen />;
  return state.kind === "ready" && ready ? (
    ready(state.me)
  ) : (
    <AccountScreen me={state.me} />
  );
}
