import type { PropsWithChildren } from "react";
import { StyleSheet, View } from "react-native";
import { colors, corners, spacing } from "@/theme/tokens";

export function Panel({
  children,
  dark = false,
}: PropsWithChildren<{ dark?: boolean }>): React.JSX.Element {
  return <View style={[styles.panel, dark && styles.dark]}>{children}</View>;
}
const styles = StyleSheet.create({
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
