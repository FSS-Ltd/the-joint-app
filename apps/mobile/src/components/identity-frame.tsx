import type { PropsWithChildren } from "react";
import { View, StyleSheet } from "react-native";
import { AppText } from "./app-text";
import { BrandMark } from "./brand-mark";
import { Screen } from "./screen";
import { colors, corners, spacing } from "@/theme/tokens";

export function IdentityFrame({
  title,
  description,
  children,
}: PropsWithChildren<{
  title: string;
  description: string;
}>): React.JSX.Element {
  return (
    <Screen compact>
      <BrandMark compact />
      <View style={styles.intro}>
        <AppText variant="heading" tone="inverse" accessibilityRole="header">
          {title}
        </AppText>
        <AppText tone="inverse">{description}</AppText>
      </View>
      <View style={styles.surface}>{children}</View>
    </Screen>
  );
}
export function Feedback({
  error,
  notice,
}: {
  error?: string;
  notice?: string;
}): React.JSX.Element | null {
  const message = error || notice;
  return message ? (
    <AppText
      accessibilityRole={error ? "alert" : "text"}
      accessibilityLiveRegion={error ? "assertive" : "polite"}
      style={error ? { color: colors.error } : undefined}
    >
      {error ? `Error: ${message}` : message}
    </AppText>
  ) : null;
}
const styles = StyleSheet.create({
  intro: { gap: spacing.medium },
  surface: {
    backgroundColor: colors.ivory,
    borderRadius: corners.surface,
    padding: spacing.large,
    gap: spacing.medium,
  },
});
