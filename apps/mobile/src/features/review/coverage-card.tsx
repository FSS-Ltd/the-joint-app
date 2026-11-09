import { useMemo, useRef, useState } from "react";
import { View, StyleSheet } from "react-native";
import type { SpendingReport } from "@joint/contracts";
import { AppText } from "@/components/app-text";
import { NativeAction } from "@/components/native-action";
import { NativeActions } from "@/components/native-actions";
import { Panel } from "@/components/panel";
import { colors, spacing } from "@/theme/tokens";
import { useNativeFinance } from "../finance/context";
import {
  NativeApiError,
  financeErrorMessage,
  needsFinanceReconciliation,
} from "../finance/errors";
import { useFinanceLifetime } from "../finance/use-lifetime";
import {
  COVERAGE_REASONS,
  canAttestCoverage,
  formatCoverageStatus,
  formatOwnershipLabel,
  formatAttestButtonLabel,
} from "./review-helpers";
import type { SpendingApi } from "../../api/spending";

export function CoverageCard({
  report,
  householdId,
  spending,
  refresh,
}: {
  report: SpendingReport;
  householdId: string;
  spending: SpendingApi;
  refresh: () => void;
}): React.JSX.Element | null {
  const finance = useNativeFinance();
  const authority = finance.authority;
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string>("");
  const abortRef = useRef<AbortController | null>(null);

  const lifetime = useMemo(
    () => ({
      start() {},
      stop() {
        abortRef.current?.abort();
        abortRef.current = null;
        setPendingId(null);
        setError("");
      },
    }),
    [],
  );
  const visible = useFinanceLifetime(finance, authority, lifetime);

  if (!visible) return null;

  async function attest(
    accountId: string,
    version: number,
    complete: boolean,
  ): Promise<void> {
    if (!authority || !finance.isCurrent(authority) || pendingId !== null)
      return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setPendingId(accountId);
    setError("");
    try {
      await spending.attestCoverage(
        householdId,
        accountId,
        report.month,
        complete,
        version,
        controller.signal,
      );
      if (!controller.signal.aborted && finance.isCurrent(authority)) {
        refresh();
      }
    } catch (cause: unknown) {
      if (controller.signal.aborted || !finance.isCurrent(authority)) return;
      if (cause instanceof NativeApiError && cause.status === 401) {
        finance.identity.revoke(authority.actor);
        return;
      }
      if (
        cause instanceof NativeApiError &&
        (cause.status === 412 || cause.code === "VERSION_CONFLICT")
      ) {
        setError(
          "Another session updated coverage for this account. Reload to view latest state, then try again.",
        );
      } else {
        setError(financeErrorMessage(cause));
      }
      if (needsFinanceReconciliation(cause)) {
        void finance.reconcile(authority);
      }
    } finally {
      if (abortRef.current === controller) {
        abortRef.current = null;
        setPendingId(null);
      }
    }
  }

  return (
    <Panel>
      <AppText variant="label" tone="secondary">
        How complete is this picture?
      </AppText>
      <AppText variant="title">
        {report.coverage.complete
          ? "Ready to review together"
          : "A little context first"}
      </AppText>

      {report.coverage.reasons.length > 0 && (
        <View style={styles.reasonsList}>
          {report.coverage.reasons.map((r) => (
            <AppText key={r} tone="secondary" style={styles.reasonItem}>
              • {COVERAGE_REASONS[r] ?? r}
            </AppText>
          ))}
        </View>
      )}

      <AppText tone="secondary" style={styles.contextText}>
        Confirm history only when all booked records for the whole month are
        included. An import alone cannot prove this.
      </AppText>

      <View style={styles.accountsList}>
        {report.scope.map((account) => {
          const isPending = pendingId === account.id;
          const canToggle = canAttestCoverage(
            account,
            report.coverage.closedPeriod,
          );
          const ownership = formatOwnershipLabel(account.ownership);
          const status = formatCoverageStatus(account.coverage.complete);
          const buttonLabel = formatAttestButtonLabel(
            account.coverage.complete,
            isPending,
          );

          return (
            <View key={account.id} style={styles.accountRow}>
              <View style={styles.accountInfo}>
                <AppText variant="label">{account.label}</AppText>
                <AppText tone="secondary" style={styles.accountStatus}>
                  {ownership} · {status}
                </AppText>
              </View>

              {account.ownership === "OWNED" && (
                <NativeActions>
                  <NativeAction
                    label={buttonLabel}
                    tone="secondary"
                    compact
                    disabled={!canToggle || pendingId !== null}
                    pending={isPending}
                    onPress={() =>
                      void attest(
                        account.id,
                        account.coverage.version,
                        !account.coverage.complete,
                      )
                    }
                  />
                </NativeActions>
              )}
            </View>
          );
        })}
      </View>

      {error !== "" && (
        <>
          <AppText accessibilityLiveRegion="polite" style={styles.error}>
            {error}
          </AppText>
          <NativeActions>
            <NativeAction
              label="Reload review"
              tone="secondary"
              onPress={refresh}
              disabled={pendingId !== null}
            />
          </NativeActions>
        </>
      )}
    </Panel>
  );
}

const styles = StyleSheet.create({
  reasonsList: {
    gap: spacing.small / 2,
  },
  reasonItem: {
    fontSize: 14,
    lineHeight: 20,
  },
  contextText: {
    fontSize: 13,
    lineHeight: 18,
  },
  accountsList: {
    gap: spacing.medium,
  },
  accountRow: {
    gap: spacing.small,
    paddingTop: spacing.small,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  accountInfo: {
    gap: 2,
  },
  accountStatus: {
    fontSize: 13,
    lineHeight: 18,
  },
  error: {
    color: colors.error,
    fontSize: 14,
    lineHeight: 20,
  },
});
