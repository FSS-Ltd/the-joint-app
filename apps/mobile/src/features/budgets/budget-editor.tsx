import { useMemo, useRef, useState } from "react";
import { View, StyleSheet } from "react-native";
import type { SpendingReport } from "@joint/contracts";
import { AppText } from "@/components/app-text";
import { NativeField } from "@/components/native-field";
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
  validateBudgetLines,
  buildBudgetPayload,
  formatLineAmount,
  type BudgetLineInput,
} from "./budget-editor-helpers";
import type { SpendingApi } from "../../api/spending";

function initialLines(report: SpendingReport): BudgetLineInput[] {
  if (report.budget?.lines && report.budget.lines.length > 0) {
    return report.budget.lines.map((l) => ({
      category: l.category ?? "",
      amount: formatLineAmount(l.limit.amountMinor),
    }));
  }
  return [{ category: "", amount: "" }];
}

export function BudgetEditor({
  report,
  householdId,
  spending,
  onSaved,
  onReload,
  onBack,
}: {
  report: SpendingReport;
  householdId: string;
  spending: SpendingApi;
  onSaved: () => void;
  onReload?: () => void;
  onBack: () => void;
}): React.JSX.Element | null {
  const finance = useNativeFinance();
  const authority = finance.authority;
  const [lines, setLines] = useState<BudgetLineInput[]>(() =>
    initialLines(report),
  );
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const abortRef = useRef<AbortController | null>(null);

  const lifetime = useMemo(
    () => ({
      start() {},
      stop() {
        abortRef.current?.abort();
        abortRef.current = null;
        setPending(false);
        setError("");
        setLines(initialLines(report));
      },
    }),
    [report],
  );
  const visible = useFinanceLifetime(finance, authority, lifetime);

  if (!visible || report.scope.length === 0) return null;

  function updateLine(
    index: number,
    field: keyof BudgetLineInput,
    value: string,
  ): void {
    setLines((prev) => {
      const next = [...prev];
      next[index] = { ...next[index]!, [field]: value };
      return next;
    });
  }

  function addLine(): void {
    setLines((prev) =>
      prev.length >= 100 ? prev : [...prev, { category: "", amount: "" }],
    );
  }

  function removeOrClearLine(index: number): void {
    setLines((prev) =>
      prev.length <= 1
        ? [{ category: "", amount: "" }]
        : prev.filter((_, i) => i !== index),
    );
  }

  async function submit(): Promise<void> {
    if (!authority || !finance.isCurrent(authority) || abortRef.current) return;
    setError("");
    const validationError = validateBudgetLines(lines);
    if (validationError) {
      setError(validationError);
      return;
    }
    const body = buildBudgetPayload(
      lines,
      report.scope.map((a) => a.id),
    );
    const version = report.budget?.version ?? 0;
    const controller = new AbortController();
    abortRef.current = controller;
    setPending(true);
    try {
      await spending.putBudget(
        householdId,
        report.month,
        body,
        version,
        controller.signal,
      );
      if (!controller.signal.aborted && finance.isCurrent(authority)) {
        onSaved();
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
          "The budget was updated by another session. Reload to see the latest version, then try again.",
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
        setPending(false);
      }
    }
  }

  return (
    <Panel>
      <AppText variant="title">Plan a comfortable month</AppText>
      <AppText tone="secondary">
        These limits are shared with adults who can see every selected account.
        They do not move money.
      </AppText>

      {!report.coverage.complete && (
        <AppText tone="secondary" style={styles.hint}>
          Month-end coverage is not yet complete. Confirm all transactions are
          recorded before setting final caps.
        </AppText>
      )}

      {lines.map((line, index) => (
        <View key={index} style={styles.lineRow}>
          <View style={styles.lineFields}>
            <NativeField
              label={`Category ${index + 1}`}
              value={line.category}
              onChangeText={(v) => updateLine(index, "category", v)}
              autoCapitalize="words"
              maxLength={80}
              editable={!pending}
            />
            <NativeField
              label={`Limit (£) ${index + 1}`}
              value={line.amount}
              onChangeText={(v) => updateLine(index, "amount", v)}
              keyboardType="decimal-pad"
              editable={!pending}
            />
          </View>
          <NativeActions>
            <NativeAction
              label={
                lines.length > 1
                  ? `Remove category ${index + 1}`
                  : `Clear category ${index + 1}`
              }
              tone="text"
              compact
              onPress={() => removeOrClearLine(index)}
              disabled={pending}
            />
          </NativeActions>
        </View>
      ))}

      {error !== "" && (
        <AppText accessibilityLiveRegion="polite" style={styles.error}>
          {error}
        </AppText>
      )}

      <NativeActions>
        {error !== "" && (
          <NativeAction
            label="Reload budget"
            tone="secondary"
            onPress={onReload ?? onSaved}
            disabled={pending}
          />
        )}
        <NativeAction
          label="Add another category"
          tone="secondary"
          onPress={addLine}
          disabled={pending || lines.length >= 100}
        />
        <NativeAction
          label="Save budget caps"
          onPress={() => void submit()}
          pending={pending}
          disabled={pending}
        />
        <NativeAction
          label="Back to spending plan"
          tone="secondary"
          disabled={pending}
          onPress={() => {
            if (!abortRef.current) onBack();
          }}
        />
      </NativeActions>
    </Panel>
  );
}

const styles = StyleSheet.create({
  hint: {
    fontSize: 13,
    lineHeight: 18,
  },
  lineRow: {
    gap: spacing.small,
  },
  lineFields: {
    gap: spacing.small,
  },
  error: {
    color: colors.error,
    fontSize: 14,
    lineHeight: 20,
  },
});
