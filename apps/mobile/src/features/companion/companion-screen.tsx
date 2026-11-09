import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { AppText } from "@/components/app-text";
import { NativeAction } from "@/components/native-action";
import { NativeActions } from "@/components/native-actions";
import { Panel } from "@/components/panel";
import { Screen } from "@/components/screen";
import { colors, corners, spacing } from "@/theme/tokens";
import type { DeviceAccountPermission, DevicesApi } from "@/api/devices";
import { createDevicesApi } from "@/api/devices";
import { createAccountsApi, type AccountsApi } from "@/api/accounts";
import { useIdentity } from "../identity/context";
import { useCompanion } from "./use-companion";

export type CompanionScreenProps = {
  householdId: string;
  devicesApi?: DevicesApi;
  accountsApi?: AccountsApi;
  onBack?: () => void;
};

export function CompanionScreen({
  householdId,
  devicesApi,
  accountsApi,
  onBack,
}: CompanionScreenProps): React.JSX.Element {
  const identity = useIdentity();
  const resolvedDevicesApi =
    devicesApi ?? createDevicesApi(identity.finance.transport);
  const resolvedAccountsApi =
    accountsApi ?? createAccountsApi(identity.finance.transport);

  const {
    loading,
    activeDevice,
    pendingDevice,
    pairingState,
    accounts,
    grants,
    jobs,
    pairingPending,
    approvalPending,
    revocationPending,
    createJobPending,
    statusNotice,
    clearStatusNotice,
    loadDevices,
    startPairing,
    approveDevice,
    revokeDevice,
    updateAccountGrant,
    createInsightJob,
  } = useCompanion({
    householdId,
    devicesApi: resolvedDevicesApi,
    accountsApi: resolvedAccountsApi,
  });

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={styles.container}
        refreshControl={
          <RefreshControl
            refreshing={loading}
            onRefresh={() => void loadDevices()}
            tintColor={colors.action}
          />
        }
      >
        {onBack && (
          <NativeActions>
            <NativeAction label="Back" tone="text" compact onPress={onBack} />
          </NativeActions>
        )}

        <View style={styles.header}>
          <AppText variant="heading" tone="primary">
            Local Companion (Mac)
          </AppText>
          <AppText variant="body" tone="secondary">
            Execute private financial insights locally on your paired Mac.
            Evidence is decrypted in memory only and processed via loopback
            Ollama with zero cloud model fallback.
          </AppText>
        </View>

        {statusNotice && (
          <Pressable
            onPress={clearStatusNotice}
            accessibilityRole="alert"
            accessibilityLabel={`${statusNotice.tone}: ${statusNotice.text}. Tap to dismiss.`}
            style={[
              styles.notice,
              statusNotice.tone === "error" && styles.noticeError,
              statusNotice.tone === "warning" && styles.noticeWarning,
              statusNotice.tone === "success" && styles.noticeSuccess,
            ]}
          >
            <AppText
              variant="label"
              style={[
                styles.noticeText,
                statusNotice.tone === "error" && styles.noticeTextError,
                statusNotice.tone === "warning" && styles.noticeTextWarning,
                statusNotice.tone === "success" && styles.noticeTextSuccess,
              ]}
            >
              {statusNotice.text}
            </AppText>
          </Pressable>
        )}

        {loading ? (
          <Panel>
            <View style={styles.loadingInner}>
              <ActivityIndicator size="small" color={colors.action} />
              <AppText variant="label" tone="secondary">
                Loading companion device status...
              </AppText>
            </View>
          </Panel>
        ) : (
          <>
            {/* Pairing & Device State */}
            {!activeDevice && !pendingDevice && (
              <Panel>
                <AppText variant="title" tone="primary">
                  Pair a New Mac
                </AppText>
                <AppText variant="body" tone="secondary">
                  Generate a one-time 6-digit numeric pairing code to link a
                  MacBook or desktop Mac to this household.
                </AppText>

                {pairingState ? (
                  <View style={styles.pairingCodeBox}>
                    <AppText variant="label" tone="secondary">
                      One-time pairing code (valid for 10 minutes):
                    </AppText>
                    <AppText variant="heading" style={styles.codeText}>
                      {pairingState.pairingCode}
                    </AppText>
                    <AppText variant="label" tone="secondary">
                      Run in Terminal on your Mac:
                    </AppText>
                    <View style={styles.terminalBox}>
                      <AppText variant="label" style={styles.terminalText}>
                        {`joint-companion pair --code ${pairingState.pairingCode}`}
                      </AppText>
                    </View>
                  </View>
                ) : (
                  <NativeActions>
                    <NativeAction
                      label={
                        pairingPending ? "Generating Code..." : "Start Pairing"
                      }
                      tone="primary"
                      disabled={pairingPending}
                      onPress={() => void startPairing()}
                    />
                  </NativeActions>
                )}
              </Panel>
            )}

            {/* Pending Device Approval */}
            {pendingDevice && (
              <Panel>
                <AppText variant="title" tone="primary">
                  Device Awaiting Approval
                </AppText>
                <AppText variant="body" tone="secondary">
                  A companion device has completed proof of possession and is
                  requesting household admission.
                </AppText>

                <View style={styles.deviceMeta}>
                  <AppText variant="label" tone="primary">
                    Name: {pendingDevice.name}
                  </AppText>
                  <AppText variant="label" tone="secondary">
                    Fingerprint: {pendingDevice.fingerprint.slice(0, 32)}...
                  </AppText>
                </View>

                <NativeActions>
                  <NativeAction
                    label={
                      approvalPending ? "Approving..." : "Approve Companion"
                    }
                    tone="primary"
                    disabled={approvalPending}
                    onPress={() =>
                      void approveDevice(
                        pendingDevice.id,
                        pendingDevice.fingerprint,
                      )
                    }
                  />
                  <NativeAction
                    label="Reject"
                    tone="secondary"
                    disabled={approvalPending}
                    onPress={() => void revokeDevice(pendingDevice.id)}
                  />
                </NativeActions>
              </Panel>
            )}

            {/* Active Device */}
            {activeDevice && (
              <Panel>
                <View style={styles.cardHeaderRow}>
                  <View>
                    <AppText variant="title" tone="primary">
                      {activeDevice.name}
                    </AppText>
                    <AppText variant="label" tone="secondary">
                      Status: APPROVED (Active)
                    </AppText>
                  </View>
                  <View style={styles.badge}>
                    <AppText variant="label" style={styles.badgeText}>
                      LOCAL
                    </AppText>
                  </View>
                </View>

                <AppText variant="label" tone="secondary">
                  Fingerprint: {activeDevice.fingerprint.slice(0, 32)}...
                </AppText>

                <NativeActions>
                  <NativeAction
                    label={
                      revocationPending ? "Revoking..." : "Revoke Device Access"
                    }
                    tone="secondary"
                    disabled={revocationPending}
                    onPress={() => void revokeDevice(activeDevice.id)}
                  />
                </NativeActions>
              </Panel>
            )}

            {/* Account Consent Grants */}
            {activeDevice && (
              <Panel>
                <AppText variant="title" tone="primary">
                  Account Consent Controls
                </AppText>
                <AppText variant="body" tone="secondary">
                  Choose granular data access for this device. Data is only
                  shared for accounts where you explicitly grant permission.
                </AppText>

                {accounts.length === 0 ? (
                  <AppText variant="label" tone="secondary">
                    No household accounts available to configure.
                  </AppText>
                ) : (
                  accounts.map((acc) => {
                    const currentGrant = grants.find(
                      (g) => g.accountId === acc.id,
                    );
                    const currentPerm: DeviceAccountPermission =
                      currentGrant?.permission ?? "NONE";

                    return (
                      <View key={acc.id} style={styles.accountRow}>
                        <View style={styles.accountInfo}>
                          <AppText variant="label" tone="primary">
                            {acc.name}
                          </AppText>
                          <AppText variant="label" tone="secondary">
                            Access: {currentPerm}
                          </AppText>
                        </View>

                        <View style={styles.permButtons}>
                          {(["NONE", "TOTALS", "TRANSACTIONS"] as const).map(
                            (p) => {
                              const isSelected = currentPerm === p;
                              return (
                                <Pressable
                                  key={p}
                                  accessibilityRole="button"
                                  accessibilityLabel={`Set ${acc.name} access to ${p}`}
                                  style={[
                                    styles.permButton,
                                    isSelected && styles.permButtonActive,
                                  ]}
                                  onPress={() =>
                                    void updateAccountGrant(
                                      activeDevice.id,
                                      acc.id,
                                      p,
                                    )
                                  }
                                >
                                  <AppText
                                    variant="label"
                                    style={[
                                      styles.permButtonText,
                                      isSelected && styles.permButtonTextActive,
                                    ]}
                                  >
                                    {p}
                                  </AppText>
                                </Pressable>
                              );
                            },
                          )}
                        </View>
                      </View>
                    );
                  })
                )}
              </Panel>
            )}

            {/* Insight Jobs Actions & List */}
            {activeDevice && (
              <Panel>
                <AppText variant="title" tone="primary">
                  Local Financial Insights
                </AppText>
                <AppText variant="body" tone="secondary">
                  Queue private insight jobs. Your Mac will claim, execute with
                  deterministic tools, and submit signed results.
                </AppText>

                <NativeActions>
                  <NativeAction
                    label="Run Spending Review"
                    tone="primary"
                    disabled={createJobPending}
                    compact
                    onPress={() => void createInsightJob("SPEND_SUMMARY")}
                  />
                  <NativeAction
                    label="Audit Recurring Costs"
                    tone="secondary"
                    disabled={createJobPending}
                    compact
                    onPress={() => void createInsightJob("RECURRING_COSTS")}
                  />
                  <NativeAction
                    label="Project Savings Goal"
                    tone="secondary"
                    disabled={createJobPending}
                    compact
                    onPress={() => void createInsightJob("GOAL_PROJECTION")}
                  />
                </NativeActions>

                {jobs.length > 0 && (
                  <View style={styles.jobsList}>
                    <AppText variant="label" tone="primary">
                      Recent Insight Jobs
                    </AppText>
                    {jobs.slice(0, 5).map((j) => (
                      <View key={j.id} style={styles.jobItem}>
                        <View style={styles.cardHeaderRow}>
                          <AppText variant="label" tone="primary">
                            {j.featureType}
                          </AppText>
                          <AppText
                            variant="label"
                            style={[
                              styles.statusTag,
                              (j.status === "VALIDATED" ||
                                j.status === "AVAILABLE") &&
                                styles.statusTagDone,
                              j.status === "FAILED" && styles.statusTagFail,
                            ]}
                          >
                            {j.status}
                          </AppText>
                        </View>
                        {j.resultPayload &&
                          typeof j.resultPayload === "object" && (
                            <AppText
                              variant="label"
                              tone="secondary"
                              style={styles.summaryText}
                            >
                              {String(
                                (j.resultPayload as Record<string, unknown>)
                                  .summary || "",
                              )}
                            </AppText>
                          )}
                        <AppText variant="label" tone="secondary">
                          {new Date(j.createdAt).toLocaleDateString(undefined, {
                            month: "short",
                            day: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </AppText>
                      </View>
                    ))}
                  </View>
                )}
              </Panel>
            )}

            {/* Privacy Guarantee Disclosure */}
            <Panel dark>
              <AppText variant="label" tone="inverse">
                100% On-Device Execution
              </AppText>
              <AppText variant="body" tone="inverse">
                The Joint App companion never uploads raw transactions, account
                numbers, or financial queries to third-party AI services. Your
                data is protected by AES-256-GCM authenticated envelopes and
                processed on your Mac over local loopback.
              </AppText>
            </Panel>
          </>
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: spacing.medium,
    gap: spacing.medium,
  },
  header: {
    gap: spacing.small,
  },
  notice: {
    padding: spacing.medium,
    borderRadius: corners.action,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.ivory,
  },
  noticeError: {
    borderColor: colors.error,
    backgroundColor: "#FBEBEB",
  },
  noticeWarning: {
    borderColor: colors.apricot,
    backgroundColor: "#FEF7F0",
  },
  noticeSuccess: {
    borderColor: colors.action,
    backgroundColor: "#EBF3EF",
  },
  noticeText: {
    color: colors.forest,
  },
  noticeTextError: {
    color: colors.error,
  },
  noticeTextWarning: {
    color: colors.forest,
  },
  noticeTextSuccess: {
    color: colors.action,
  },
  cardHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  badge: {
    backgroundColor: colors.sage,
    paddingHorizontal: spacing.small,
    paddingVertical: 2,
    borderRadius: corners.surface,
  },
  badgeText: {
    color: colors.forest,
    fontWeight: "600",
  },
  pairingCodeBox: {
    backgroundColor: colors.ivory,
    padding: spacing.medium,
    borderRadius: corners.action,
    alignItems: "center",
    gap: spacing.small,
    borderWidth: 1,
    borderColor: colors.border,
  },
  codeText: {
    fontSize: 32,
    letterSpacing: 4,
    color: colors.action,
    fontWeight: "700",
  },
  terminalBox: {
    backgroundColor: colors.forest,
    padding: spacing.small,
    borderRadius: corners.surface,
    width: "100%",
  },
  terminalText: {
    color: colors.ivory,
    fontFamily: "monospace",
    fontSize: 12,
  },
  deviceMeta: {
    gap: 4,
  },
  accountRow: {
    paddingVertical: spacing.small,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    gap: spacing.small,
  },
  accountInfo: {
    gap: 2,
  },
  permButtons: {
    flexDirection: "row",
    gap: spacing.small,
  },
  permButton: {
    flex: 1,
    paddingVertical: 8,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: corners.surface,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.ivory,
    minHeight: 48,
  },
  permButtonActive: {
    backgroundColor: colors.action,
    borderColor: colors.action,
  },
  permButtonText: {
    color: colors.secondary,
    fontWeight: "500",
  },
  permButtonTextActive: {
    color: colors.ivory,
    fontWeight: "600",
  },
  jobActions: {
    gap: spacing.small,
  },
  jobsList: {
    marginTop: spacing.small,
    gap: spacing.small,
  },
  jobItem: {
    backgroundColor: colors.ivory,
    padding: spacing.small,
    borderRadius: corners.surface,
    gap: 4,
  },
  statusTag: {
    fontWeight: "600",
    color: colors.secondary,
  },
  statusTagDone: {
    color: colors.action,
  },
  statusTagFail: {
    color: colors.error,
  },
  summaryText: {
    fontStyle: "italic",
  },
  loadingInner: {
    alignItems: "center",
    gap: spacing.small,
    padding: spacing.large,
  },
});
