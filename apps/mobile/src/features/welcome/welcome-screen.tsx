import { Host } from "@expo/ui";
import { useState } from "react";
import { Image, StyleSheet, View } from "react-native";

import brandImage from "../../../../web/public/brand/family-fund-forest.png";

import { AppText } from "@/components/app-text";
import { EmptyState } from "@/components/empty-state";
import { NativeAction } from "@/components/native-action";
import { Screen } from "@/components/screen";
import { SharingSheet } from "@/features/welcome/sharing-sheet";
import { colors, corners, spacing } from "@/theme/tokens";

export function WelcomeScreen(): React.JSX.Element {
  const [isSharingPresented, setIsSharingPresented] = useState(false);

  return (
    <Screen>
      <View style={styles.brand}>
        <Image
          source={brandImage}
          accessibilityLabel="The Family Fund App"
          resizeMode="contain"
          style={styles.logo}
        />
      </View>
      <View style={styles.introduction}>
        <AppText variant="label" style={styles.eyebrow}>
          ROOM FOR WHAT MATTERS
        </AppText>
        <AppText variant="heading" tone="inverse" accessibilityRole="header">
          Your household, in view.
        </AppText>
        <AppText tone="inverse">
          A calmer way to understand money together.
        </AppText>
      </View>
      <EmptyState
        title="A shared view starts here"
        description="No financial data is shown on this screen."
      />
      <View style={styles.notice}>
        <AppText variant="label">Private by default</AppText>
        <AppText>Sharing is a choice. Ownership stays yours.</AppText>
      </View>
      <Host
        colorScheme="light"
        seedColor={colors.action}
        matchContents={{ vertical: true }}
      >
        <NativeAction
          label="How sharing works"
          onPress={() => setIsSharingPresented(true)}
        />
        <SharingSheet
          isPresented={isSharingPresented}
          onDismiss={() => setIsSharingPresented(false)}
        />
      </Host>
    </Screen>
  );
}

const styles = StyleSheet.create({
  brand: {
    backgroundColor: colors.ivory,
    borderRadius: corners.surface,
    padding: spacing.medium,
  },
  logo: { width: "100%", height: 72 },
  introduction: { gap: spacing.medium },
  eyebrow: { color: colors.sage },
  notice: {
    backgroundColor: colors.apricot,
    borderRadius: corners.surface,
    padding: spacing.large,
    gap: spacing.small,
  },
});
