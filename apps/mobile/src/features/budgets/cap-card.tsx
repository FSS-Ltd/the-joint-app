import { useRef, useEffect, type PropsWithChildren } from "react";
import { Animated, View, StyleSheet, AccessibilityInfo } from "react-native";
import type { AggregateMoney, BudgetResponse } from "@joint/contracts";
import { formatAggregateMoney } from "@joint/domain/cash-flow";
import { AppText } from "@/components/app-text";
import { Panel } from "@/components/panel";
import { colors, corners, spacing } from "@/theme/tokens";
import {
  capPosition,
  formatCapBalance,
  formatCapStatus,
  formatSavingImpact,
  hasNetRefund,
} from "./cap-math";

export function CapRuler({
  category,
  withinPercent,
  overPercent,
  usedPercent,
  balance,
  spentLabel,
  limitLabel,
  isOver,
}: {
  category: string;
  withinPercent: number;
  overPercent: number;
  usedPercent: number;
  balance: string;
  spentLabel: string;
  limitLabel: string;
  isOver: boolean;
}): React.JSX.Element {
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!isOver) return;
    let cancelled = false;
    let loop: Animated.CompositeAnimation | null = null;

    const applyMotion = (reduced: boolean) => {
      loop?.stop();
      loop = null;
      pulseAnim.stopAnimation();
      pulseAnim.setValue(1);
      if (reduced || cancelled) return;
      loop = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 0.5,
            duration: 700,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 700,
            useNativeDriver: true,
          }),
        ]),
      );
      loop.start();
    };

    void AccessibilityInfo.isReduceMotionEnabled().then(applyMotion);
    const sub = AccessibilityInfo.addEventListener?.(
      "reduceMotionChanged",
      applyMotion,
    );

    return () => {
      cancelled = true;
      sub?.remove?.();
      loop?.stop();
      pulseAnim.stopAnimation();
      pulseAnim.setValue(1);
    };
  }, [isOver, pulseAnim]);

  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={`${category} cap used`}
      accessibilityValue={{
        min: 0,
        max: 100,
        now: usedPercent,
        text: `${spentLabel} spent of ${limitLabel} cap, ${balance}`,
      }}
      style={styles.ruler}
    >
      <View
        style={[
          styles.rulerTrack,
          { backgroundColor: isOver ? colors.error : colors.sage },
        ]}
      >
        <View
          style={[
            styles.rulerFill,
            {
              width: `${withinPercent}%`,
              backgroundColor: isOver ? colors.secondary : colors.action,
            },
          ]}
        />
        {overPercent > 0 && (
          <Animated.View
            style={[
              styles.rulerFill,
              {
                width: `${overPercent}%`,
                backgroundColor: colors.error,
                opacity: pulseAnim,
              },
            ]}
          />
        )}
      </View>
    </View>
  );
}

export function CapCard({
  line,
  actual,
  tint,
  children,
  partialCoverage = false,
}: PropsWithChildren<{
  line: BudgetResponse["lines"][number];
  actual: AggregateMoney;
  tint?: "apricot";
  partialCoverage?: boolean;
}>): React.JSX.Element {
  const position = capPosition(line.limit.amountMinor, actual.amountMinor);
  const category = line.category ?? "Uncategorized";
  const balance = formatCapBalance(position);
  const qualifiedBalance = partialCoverage
    ? `${balance} based on recorded spending`
    : balance;
  const status = partialCoverage
    ? "Partial coverage"
    : formatCapStatus(position);
  const savingImpact = formatSavingImpact(category, position);
  const netRefund = hasNetRefund(actual.amountMinor);
  const isOver = position.status === "over";
  const spentLabel = formatAggregateMoney(actual);
  const limitLabel = formatAggregateMoney(line.limit);

  return (
    <Panel tint={tint} compact={tint === "apricot"}>
      <View style={styles.header}>
        <AppText variant="label">{category}</AppText>
        <AppText
          variant="label"
          tone="secondary"
          style={isOver && styles.overLabel}
        >
          {status}
        </AppText>
      </View>

      <AppText variant="title">{qualifiedBalance}</AppText>

      <AppText tone="secondary">
        {spentLabel} spent · {limitLabel} cap
      </AppText>

      <CapRuler
        category={category}
        withinPercent={position.withinPercent}
        overPercent={position.overPercent}
        usedPercent={position.usedPercent}
        balance={qualifiedBalance}
        spentLabel={spentLabel}
        limitLabel={limitLabel}
        isOver={isOver}
      />

      {savingImpact && (
        <AppText tone="secondary" style={styles.hint}>
          {savingImpact}
        </AppText>
      )}

      {!savingImpact && netRefund && (
        <AppText tone="secondary" style={styles.hint}>
          Net refunds increase the remaining allowance. This is a cap
          comparison, not an account balance.
        </AppText>
      )}
      {children}
    </Panel>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.small,
    justifyContent: "space-between",
    alignItems: "center",
  },
  overLabel: {
    color: colors.error,
  },
  ruler: {
    height: 12,
    borderRadius: corners.action,
    overflow: "hidden",
  },
  rulerTrack: {
    flex: 1,
    flexDirection: "row",
    borderRadius: corners.action,
    overflow: "hidden",
  },
  rulerFill: {
    height: 12,
  },
  hint: {
    fontSize: 13,
    lineHeight: 18,
  },
});
