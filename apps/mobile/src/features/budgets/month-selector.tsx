import { Host } from "@expo/ui";
import { View, StyleSheet, useWindowDimensions } from "react-native";
import { AppText } from "@/components/app-text";
import { NativeAction } from "@/components/native-action";
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
  return (
    <View style={[styles.monthRow, stacked && styles.stacked]}>
      <Host
        colorScheme="light"
        seedColor={colors.action}
        matchContents={{ horizontal: !stacked, vertical: true }}
      >
        <NativeAction
          label="< Previous"
          tone="text"
          compact={!stacked}
          onPress={onPrevious}
        />
      </Host>
      <AppText
        variant="label"
        style={[styles.monthLabel, stacked && styles.stackedLabel]}
      >
        {formatMonthLabel(month)}
      </AppText>
      <Host
        colorScheme="light"
        seedColor={colors.action}
        matchContents={{ horizontal: !stacked, vertical: true }}
      >
        <NativeAction
          label="Next >"
          tone="text"
          compact={!stacked}
          onPress={onNext}
          disabled={month >= current}
        />
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
    flex: 1,
    textAlign: "center",
    color: colors.ivory,
  },
  stacked: {
    flexDirection: "column",
    alignItems: "stretch",
  },
  stackedLabel: {
    flex: 0,
  },
});
