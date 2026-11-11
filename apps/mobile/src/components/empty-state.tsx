import { StyleSheet, View } from "react-native";
import type { PropsWithChildren } from "react";

import { AppText } from "@/components/app-text";
import { colors, corners, spacing } from "@/theme/tokens";

type EmptyStateProps = PropsWithChildren<{
  title: string;
  description: string;
}>;

export function EmptyState({
  title,
  description,
  children,
}: EmptyStateProps): React.JSX.Element {
  return (
    <View style={styles.container}>
      <AppText variant="title" accessibilityRole="header">
        {title}
      </AppText>
      <AppText tone="secondary">{description}</AppText>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.ivory,
    borderRadius: corners.surface,
    padding: spacing.large,
    gap: spacing.medium,
  },
});
