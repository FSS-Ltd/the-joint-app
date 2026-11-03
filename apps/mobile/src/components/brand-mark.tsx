import { Image, StyleSheet, View } from "react-native";
import brandImage from "../../../web/public/brand/family-fund-forest.png";
import { AppText } from "./app-text";
import { colors, spacing } from "@/theme/tokens";
export function BrandMark({
  compact = false,
}: {
  compact?: boolean;
}): React.JSX.Element {
  return (
    <View style={styles.brand}>
      <Image
        accessible
        accessibilityRole="image"
        source={brandImage}
        accessibilityLabel="The Family Fund App"
        resizeMode="contain"
        style={[styles.mark, compact && styles.compact]}
      />
      <AppText variant="label" style={styles.description}>
        Shared household ledger
      </AppText>
    </View>
  );
}
const styles = StyleSheet.create({
  brand: {
    alignItems: "flex-start",
    gap: spacing.small,
    paddingVertical: spacing.small,
  },
  mark: { width: 204, height: 68, maxWidth: "100%", tintColor: colors.ivory },
  compact: { width: 174, height: 58 },
  description: { color: colors.sage, fontWeight: "400" },
});
