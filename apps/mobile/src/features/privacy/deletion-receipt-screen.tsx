import { useEffect, useState } from "react";
import {
  idempotencyKeySchema,
  type DeletionReceipt,
  type DeletionStatus,
} from "@joint/contracts";
import { AppState } from "react-native";
import { AppText } from "@/components/app-text";
import { Feedback, IdentityFrame } from "@/components/identity-frame";
import { NativeAction } from "@/components/native-action";
import { NativeActions } from "@/components/native-actions";
import { Panel } from "@/components/panel";
import { nativeErrorMessage } from "../../api/errors";
import { createPrivacyApi, type PrivacyApi } from "../../api/privacy";
import { useIdentity } from "../identity/context";
import { watchPrivacyStatus } from "./watch-status";

export function DeletionReceiptScreen({
  receipt,
  onClose,
  privacy: injectedPrivacy,
}: {
  receipt: DeletionReceipt | null;
  onClose: () => void;
  privacy?: PrivacyApi;
}): React.JSX.Element {
  const identity = useIdentity();
  const privacy =
    injectedPrivacy ??
    identity.privacy ??
    createPrivacyApi(identity.finance.transport);
  const [status, setStatus] = useState<DeletionStatus | null>(null);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const [reconnecting, setReconnecting] = useState(false);

  const id = receipt?.id ?? null;
  const statusToken = receipt?.statusToken ?? "";

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      if (state !== "active") {
        setStatus(null);
        setError("");
        setReconnecting(false);
        onClose();
      }
    });
    return () => {
      subscription.remove();
    };
  }, [onClose]);

  useEffect(() => {
    setStatus(null);
    setError("");
    setReconnecting(false);
    const parsed = idempotencyKeySchema.safeParse(id);
    if (!parsed.success || !/^[A-Za-z0-9_-]{43}$/.test(statusToken)) {
      setError("This deletion receipt is unavailable.");
      return;
    }
    const receiptId = parsed.data;
    return watchPrivacyStatus({
      selector: { kind: "deletion", id: receiptId },
      transport: identity.finance.transport,
      authorization: { kind: "deletion-receipt", token: statusToken },
      read: (signal) =>
        privacy.readDeletionStatus(receiptId, statusToken, signal),
      receive: (result) => {
        setStatus(result);
        setError("");
        setReconnecting(false);
      },
      unavailable: (cause) => {
        setStatus(null);
        setError(cause ? nativeErrorMessage(cause) : "");
        setReconnecting(true);
      },
      failure: (cause) => {
        setStatus(null);
        setReconnecting(false);
        setError(nativeErrorMessage(cause));
      },
    });
  }, [id, statusToken, revision, privacy, identity.finance.transport]);

  return (
    <IdentityFrame
      title="Your deletion request."
      description="A private status receipt for this device."
    >
      <Panel>
        <AppText variant="title">Deletion status</AppText>
        <Feedback error={error} />
        {reconnecting && (
          <AppText accessibilityLiveRegion="polite">
            Reconnecting to receipt updates…
          </AppText>
        )}
        {!status && !error && !reconnecting && (
          <AppText accessibilityLiveRegion="polite">Checking request…</AppText>
        )}
        {status && (
          <AppText accessibilityLiveRegion="polite">
            {status.state === "COMPLETED"
              ? "Deletion completed."
              : status.state === "PROVIDER_PENDING"
                ? "App access has ended. Provider cleanup is still pending."
                : "Your deletion request is being processed. App access has ended."}
          </AppText>
        )}
        <AppText tone="secondary">
          This screen contains no financial information. Your receipt expires
          and is available only on the device that requested deletion while the
          app remains open.
        </AppText>
        <NativeActions>
          <NativeAction
            label="Check status again"
            tone="secondary"
            onPress={() => setRevision((old) => old + 1)}
          />
          <NativeAction label="Close receipt" tone="text" onPress={onClose} />
        </NativeActions>
      </Panel>
    </IdentityFrame>
  );
}
