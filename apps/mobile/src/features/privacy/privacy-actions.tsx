import { randomUUID } from "expo-crypto";
import { useEffect, useRef, useState } from "react";
import type { DeletionReceipt } from "@joint/contracts";
import { View } from "react-native";
import { AppText } from "@/components/app-text";
import { Feedback } from "@/components/identity-frame";
import { NativeAction } from "@/components/native-action";
import { NativeActions } from "@/components/native-actions";
import { Panel } from "@/components/panel";
import { spacing } from "@/theme/tokens";
import { NativeApiError, nativeErrorMessage } from "../../api/errors";
import type { PrivacyApi } from "../../api/privacy";

export function PrivacyActions({
  householdId,
  actor,
  active,
  privacy,
  onOpenSecurity,
  onRevoke,
  onEndSession,
  onDeletionReceipt,
}: {
  householdId?: string;
  actor: string;
  active: boolean;
  privacy: PrivacyApi;
  onOpenSecurity: () => void;
  onRevoke: (actor: string) => void;
  onEndSession: (notice?: string) => Promise<void>;
  onDeletionReceipt: (receipt: DeletionReceipt) => void;
}): React.JSX.Element {
  const [exitKind, setExitKind] = useState<"leave" | "delete" | null>(null);
  const [action, setAction] = useState<"leave" | "delete" | null>(null);
  const [confirmation, setConfirmation] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [mfa, setMfa] = useState(false);
  const [requestId, setRequestId] = useState("");
  const receiptRef = useRef<DeletionReceipt | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!active && !exitKind) {
      abortRef.current?.abort();
      receiptRef.current = null;
      setAction(null);
      setConfirmation(false);
      setPending(false);
      setError("");
      setMfa(false);
      setRequestId("");
    }
    return () => {
      abortRef.current?.abort();
    };
  }, [active, actor, exitKind]);

  function choose(next: "leave" | "delete") {
    setAction(next);
    setConfirmation(false);
    setError("");
    setMfa(false);
    setRequestId(randomUUID());
  }

  async function completeExit(
    kind: "leave" | "delete",
    receipt?: DeletionReceipt,
  ) {
    if (receipt) receiptRef.current = receipt;
    setExitKind(kind);
    setPending(true);
    setError("");
    try {
      await onEndSession(
        kind === "leave"
          ? "You left your household. Sign in again to read and export accounts you own in your owner archive."
          : undefined,
      );
      if (receiptRef.current) onDeletionReceipt(receiptRef.current);
    } catch {
      setError(
        "Your app access has ended. Device sign-out could not finish. Retry below; your completed request will not be repeated.",
      );
      setPending(false);
    }
  }

  async function submit() {
    if (!confirmation || !action || pending || !active) return;
    abortRef.current?.abort();
    const abort = new AbortController();
    abortRef.current = abort;
    setPending(true);
    setError("");
    setMfa(false);
    try {
      if (action === "leave") {
        if (!householdId) {
          setError("Household access changed. Refresh before leaving.");
          setPending(false);
          return;
        }
        await privacy.leaveHousehold(householdId, requestId, abort.signal);
        if (abort.signal.aborted) return;
        await completeExit("leave");
      } else {
        const receipt = await privacy.requestDeletion(requestId, abort.signal);
        if (abort.signal.aborted) return;
        await completeExit("delete", receipt);
      }
    } catch (cause) {
      if (abort.signal.aborted) return;
      if (cause instanceof NativeApiError && cause.status === 401) {
        onRevoke(actor);
        return;
      }
      setError(nativeErrorMessage(cause));
      setMfa(
        cause instanceof NativeApiError &&
          (cause.code === "MFA_REQUIRED" ||
            cause.code === "MFA_REAUTH_REQUIRED"),
      );
      setPending(false);
    }
  }

  if (exitKind) {
    return (
      <Panel>
        <AppText variant="title">
          {exitKind === "leave"
            ? "Household access ended"
            : "Deletion requested"}
        </AppText>
        <AppText accessibilityLiveRegion="polite">
          {pending
            ? "Finishing device sign-out…"
            : "Your request was saved. Finish signing out before continuing."}
        </AppText>
        <Feedback error={error} />
        <NativeActions>
          <NativeAction
            label="Retry device sign-out"
            pending={pending}
            disabled={pending}
            onPress={() => void completeExit(exitKind)}
          />
        </NativeActions>
      </Panel>
    );
  }

  return (
    <Panel>
      <AppText tone="secondary">Your next chapter</AppText>
      <AppText variant="title">Leave or delete</AppText>
      <AppText>
        You can leave without exporting first. After leaving, sign in again to
        read and export accounts you legally own.
      </AppText>
      <NativeActions>
        {householdId && (
          <NativeAction
            label="Leave household"
            tone="secondary"
            disabled={pending}
            onPress={() => choose("leave")}
          />
        )}
        <NativeAction
          label="Delete my account"
          tone="secondary"
          disabled={pending}
          onPress={() => choose("delete")}
        />
      </NativeActions>
      {action && (
        <View style={{ gap: spacing.small }}>
          <AppText variant="title">
            {action === "leave"
              ? "Confirm leaving your household"
              : "Confirm account deletion"}
          </AppText>
          <AppText>
            {action === "leave"
              ? "Your household membership and shared access end immediately. Invitations and sessions are revoked. Your owned history remains in your read-only archive. Other people keep the accounts they own."
              : "Your app access and sessions end immediately. Deletion removes your private information and access. Another adult’s accounts and legally retained joint history remain. Provider cleanup may finish later. This cannot be undone."}
          </AppText>
          <AppText tone="secondary">
            {confirmation ? "Confirmed: " : "Confirmation required: "}I
            understand these consequences and want to{" "}
            {action === "leave" ? "leave my household" : "delete my account"}.
          </AppText>
          <Feedback error={error} />
          <NativeActions>
            <NativeAction
              label={
                confirmation
                  ? `Clear confirmation to ${action === "leave" ? "leave my household" : "delete my account"}`
                  : `I understand these consequences and want to ${action === "leave" ? "leave my household" : "delete my account"}`
              }
              tone="secondary"
              disabled={pending}
              onPress={() => setConfirmation((old) => !old)}
            />
            {mfa && (
              <NativeAction
                label="Verify a fresh authenticator code"
                tone="secondary"
                disabled={pending}
                onPress={onOpenSecurity}
              />
            )}
            <NativeAction
              label={
                pending
                  ? "Submitting…"
                  : action === "leave"
                    ? "Confirm and leave household"
                    : "Confirm and delete my account"
              }
              pending={pending}
              disabled={pending || !confirmation}
              onPress={() => void submit()}
            />
            <NativeAction
              label="Cancel"
              tone="text"
              disabled={pending}
              onPress={() => {
                setAction(null);
                setConfirmation(false);
                setError("");
                setMfa(false);
              }}
            />
          </NativeActions>
        </View>
      )}
    </Panel>
  );
}
