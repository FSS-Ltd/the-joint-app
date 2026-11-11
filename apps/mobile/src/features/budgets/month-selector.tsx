import { Host } from "@expo/ui";
import { View, StyleSheet, useWindowDimensions } from "react-native";
import { AppText } from "@/components/app-text";
import { NativeAction } from "@/components/native-action";
import { NativeActions } from "@/components/native-actions";
import { colors, spacing } from "@/theme/tokens";
import { currentMobileMonth, formatMonthLabel } from "./month-helpers";

export function MonthSelector({
  month,
  onPrevious,
  onNext,
}: {
  month: string;
  onPrevious: () => void;
  onNext: () => void;
}): React.JSX.Element {
  const current = currentMobileMonth();
  const { width, fontScale } = useWindowDimensions();
  const stacked = width < 380 || fontScale >= 1.3;
  const previous = { label: "Previous month", onPress: onPrevious };
  const next = {
    label: "Next month",
    onPress: onNext,
    disabled: month >= current,
  };
  const label = (
    <AppText
      variant="label"
      style={[styles.monthLabel, !stacked && styles.fill]}
    >
      {formatMonthLabel(month)}
    </AppText>
  );
  if (stacked)
    return (
      <View style={styles.stacked}>
        {label}
        <NativeActions>
          <NativeAction {...previous} tone="text" />
          <NativeAction {...next} tone="text" />
        </NativeActions>
      </View>
    );
  return (
    <View style={styles.monthRow}>
      <Host colorScheme="light" seedColor={colors.action} matchContents>
        <NativeAction {...previous} tone="text" compact />
      </Host>
      {label}
      <Host colorScheme="light" seedColor={colors.action} matchContents>
        <NativeAction {...next} tone="text" compact />
      </Host>
    </View>
  );
}

const styles = StyleSheet.create({
  monthRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.small,
  },
  monthLabel: {
    textAlign: "center",
    color: colors.ivory,
  },
  fill: { flex: 1 },
  stacked: { gap: spacing.small },
});
