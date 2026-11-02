import { StyleSheet, View } from "react-native";

import { AppText } from "@/components/app-text";
import { colors, corners, spacing } from "@/theme/tokens";

type EmptyStateProps = { title: string; description: string };

export function EmptyState({
  title,
  description,
}: EmptyStateProps): React.JSX.Element {
  return (
    <View style={styles.container}>
      <AppText variant="title" accessibilityRole="header">
        {title}
      </AppText>
      <AppText tone="secondary">{description}</AppText>
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
