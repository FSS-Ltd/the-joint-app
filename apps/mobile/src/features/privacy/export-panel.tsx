import type { AccountResponse, ExportStatus } from "@joint/contracts";
import { View } from "react-native";
import { AppText } from "@/components/app-text";
import { Feedback } from "@/components/identity-frame";
import { NativeAction } from "@/components/native-action";
import { NativeActions } from "@/components/native-actions";
import { Panel } from "@/components/panel";
import { spacing } from "@/theme/tokens";
import type { PrivacyApi } from "../../api/privacy";
import type { NativeTransport } from "../../api/types";
import type { ExportFileRegistry } from "./export-file";
import { useExportJob, type NativeExportScope } from "./use-export-job";

export const exportStateLabels: Record<ExportStatus["state"], string> = {
  QUEUED: "Your export is queued.",
  PROCESSING: "Preparing your export…",
  READY: "Your export is ready.",
  INVALIDATED:
    "Access changed. Request a new export with your current account access.",
  EXPIRED: "This export expired. Request a new export.",
  FAILED: "This export failed. Try requesting it again.",
};

export function ExportPanel({
  accounts,
  streamScope,
  actor,
  refreshing,
  scopeError,
  active,
  privacy,
  transport,
  onAccessChanged,
  onRevoke,
  onOpenSecurity,
  files,
}: {
  accounts: readonly AccountResponse[];
  streamScope: NativeExportScope;
  actor: string;
  refreshing: boolean;
  scopeError: boolean;
  active: boolean;
  privacy: PrivacyApi;
  transport: NativeTransport;
  onAccessChanged: () => void;
  onRevoke: (actor: string) => void;
  onOpenSecurity: () => void;
  files?: ExportFileRegistry;
}): React.JSX.Element {
  const {
    selected,
    choose,
    job,
    pending,
    downloading,
    error,
    mfa,
    tracking,
    retryable,
    retryStatus,
    submit,
    download,
  } = useExportJob({
    accounts,
    streamScope,
    actor,
    refreshing,
    scopeError,
    active,
    privacy,
    transport,
    onAccessChanged,
    onRevoke,
    ...(files ? { files } : {}),
  });

  const unavailable = refreshing || scopeError || !active;
  const busy =
    pending ||
    downloading ||
    tracking ||
    job?.state === "QUEUED" ||
    job?.state === "PROCESSING";

  return (
    <View
      accessible={false}
      accessibilityLabel="Export scope"
      style={{ gap: spacing.medium }}
    >
      <Panel>
        <AppText tone="secondary">Keep a copy</AppText>
        <AppText variant="title">Export your data</AppText>
        <AppText>
          Choose up to 50 accounts. Values only includes account details and
          balances. Values and details also includes transaction history and
          your own private notes.
        </AppText>
        <AppText tone="secondary">
          Exports respect your access at download time. Another person’s private
          notes are never included.
        </AppText>
        <Feedback error={error} />
        {tracking && (
          <AppText accessibilityLiveRegion="polite">
            Checking live export status…
          </AppText>
        )}
        <AppText tone="secondary">
          {accounts.length} loaded{" "}
          {accounts.length === 1 ? "account" : "accounts"} · {selected.length}{" "}
          selected
        </AppText>
        {accounts.length === 0 ? (
          <AppText tone="secondary">No accounts available to export.</AppText>
        ) : (
          <View style={{ gap: spacing.small }}>
            {accounts.map((account) => {
              const isSelected = selected.includes(account.id);
              const accessDetail =
                account.access === "TOTALS"
                  ? "Values only · balances and account details"
                  : "Values and details · history and your notes";
              return (
                <View key={account.id} style={{ gap: spacing.small / 2 }}>
                  <AppText>
                    {isSelected ? "Selected: " : "Not selected: "}
                    {account.label} ({accessDetail})
                  </AppText>
                  <NativeActions>
                    <NativeAction
                      label={
                        isSelected
                          ? `Deselect ${account.label}`
                          : `Select ${account.label}`
                      }
                      tone="secondary"
                      disabled={
                        busy ||
                        unavailable ||
                        (!isSelected && selected.length >= 50)
                      }
                      onPress={() => choose(account.id, !isSelected)}
                    />
                  </NativeActions>
                </View>
              );
            })}
          </View>
        )}
        <NativeActions>
          <NativeAction
            label={busy ? "Preparing export…" : "Request CSV export"}
            pending={pending}
            disabled={busy || unavailable || selected.length === 0}
            onPress={() => void submit()}
          />
          {retryable && (
            <NativeAction
              label="Retry export status"
              tone="secondary"
              disabled={pending || downloading}
              onPress={retryStatus}
            />
          )}
          {mfa && (
            <NativeAction
              label="Verify a fresh authenticator code"
              tone="secondary"
              disabled={pending || downloading}
              onPress={onOpenSecurity}
            />
          )}
        </NativeActions>
        {job && (
          <View accessibilityLiveRegion="polite" style={{ gap: spacing.small }}>
            <AppText accessibilityLiveRegion="polite">
              {exportStateLabels[job.state]}
            </AppText>
            {job.state === "READY" && (
              <>
                <AppText tone="secondary" accessibilityLiveRegion="polite">
                  Download before{" "}
                  {new Date(
                    job.downloadExpiresAt ?? job.expiresAt,
                  ).toLocaleString("en-GB")}
                  . Access is checked again when you download.
                </AppText>
                <NativeActions>
                  <NativeAction
                    label="Download CSV"
                    tone="secondary"
                    pending={downloading}
                    disabled={downloading || unavailable}
                    onPress={() => void download()}
                  />
                </NativeActions>
              </>
            )}
          </View>
        )}
      </Panel>
    </View>
  );
}
