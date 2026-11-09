import { View, StyleSheet } from "react-native";
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
  return (
    <View style={styles.monthRow}>
      <NativeActions>
        <NativeAction
          label="< Previous"
          tone="text"
          compact
          onPress={onPrevious}
        />
      </NativeActions>
      <AppText variant="label" style={styles.monthLabel}>
        {formatMonthLabel(month)}
      </AppText>
      <NativeActions>
        <NativeAction
          label="Next >"
          tone="text"
          compact
          onPress={onNext}
          disabled={month >= current}
        />
      </NativeActions>
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
    flex: 1,
    textAlign: "center",
    color: colors.ivory,
  },
});
