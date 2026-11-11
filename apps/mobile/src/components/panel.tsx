import type { PropsWithChildren } from "react";
import { StyleSheet, View } from "react-native";
import { colors, corners, spacing } from "@/theme/tokens";

export function Panel({
  children,
  dark = false,
  tint,
  compact = false,
}: PropsWithChildren<{
  dark?: boolean;
  tint?: "apricot" | "sage";
  compact?: boolean;
}>): React.JSX.Element {
  return (
    <View
      style={[
        styles.panel,
        compact && styles.compact,
        tint && styles[tint],
        dark && styles.dark,
      ]}
    >
      {children}
    </View>
  );
}
const styles = StyleSheet.create({
  compact: { gap: spacing.small + spacing.small / 2 },
  apricot: { backgroundColor: colors.apricot },
  sage: { backgroundColor: colors.sage },
  dark: {
    backgroundColor: colors.forest,
    borderColor: colors.border,
    borderWidth: 1,
  },
  panel: {
    backgroundColor: colors.ivory,
    borderRadius: corners.surface,
    padding: spacing.medium,
    gap: spacing.medium,
  },
});
