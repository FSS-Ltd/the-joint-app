import type { AccountResponse, CsvBalance } from "@joint/contracts";
import { formatMoney, isLiabilityKind } from "@joint/domain";
import { Pressable, StyleSheet, useWindowDimensions, View } from "react-native";
import { AppText } from "@/components/app-text";
import { ImportedBalance } from "./imported-balance";
import { colors, corners, spacing } from "@/theme/tokens";
import {
  displayDate,
  grantLabels,
  kinds,
  liquidityLabels,
  ownerLabel,
} from "./account-labels";

export function AccountRow({
  account,
  onOpen,
  balance,
}: {
  account: AccountResponse;
  balance?: CsvBalance;
  onOpen(): void;
}): React.JSX.Element {
  const { width, fontScale } = useWindowDimensions();
  const stacked = width < 360 || fontScale > 1.3;
  const valuation = account.latestValuation;
  const sharing =
    account.ownership === "OWNED" && account.sharing
      ? grantLabels[account.sharing.level]
      : grantLabels[account.access];

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityHint="Opens account details"
      onPress={onOpen}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      <View style={[styles.content, stacked && styles.stacked]}>
        <View style={[styles.identity, stacked && styles.stackedItem]}>
          <AppText variant="title">{account.label}</AppText>
          <AppText tone="secondary">
            {ownerLabel(account)} · {sharing}
          </AppText>
          <AppText tone="secondary">
            {kinds[account.kind]} · {liquidityLabels[account.liquidity]}
          </AppText>
        </View>
        <View style={[styles.value, stacked && styles.stackedItem]}>
          <ImportedBalance balance={balance} />
          {valuation ? (
            <>
              <AppText
                variant={balance?.status === "AVAILABLE" ? "body" : "title"}
              >
                {formatMoney(valuation.money)}
              </AppText>
              <AppText tone="secondary">
                {balance?.status === "AVAILABLE"
                  ? "Recorded manual balance"
                  : isLiabilityKind(account.kind)
                    ? "Total outstanding debt"
                    : "Total account value"}
              </AppText>
              <AppText tone="secondary">
                {valuation.adultMoney
                  ? `${balance?.status === "AVAILABLE" ? "Adult portion of manual valuation ·" : "Adult portion:"} ${formatMoney(valuation.adultMoney)}`
                  : balance?.status === "AVAILABLE"
                    ? "Adult portion of manual valuation unknown"
                    : "Adult portion unknown"}
              </AppText>
              <AppText tone="secondary">
                Manual valuation · {displayDate(valuation.asOfDate)}
              </AppText>
              {!valuation.complete && <AppText>Incomplete valuation</AppText>}
            </>
          ) : (
            <AppText tone="secondary">No valuation recorded</AppText>
          )}
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: 44,
    backgroundColor: colors.ivory,
    borderRadius: corners.surface,
    padding: spacing.medium,
  },
  pressed: { opacity: 0.75 },
  content: { flexDirection: "row", flexWrap: "wrap", gap: spacing.medium },
  stacked: { flexDirection: "column" },
  identity: { flexGrow: 1, flexBasis: 140 },
  value: { flexGrow: 1, flexBasis: 140, alignItems: "flex-end" },
  stackedItem: { flexBasis: "auto", alignItems: "flex-start" },
});
