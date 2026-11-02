import { Image, StyleSheet, View } from "react-native";
import brandImage from "../../../web/public/brand/family-fund-forest.png";
import { colors, corners, spacing } from "@/theme/tokens";
export function BrandMark({
  compact = false,
}: {
  compact?: boolean;
}): React.JSX.Element {
  return (
    <View style={[styles.brand, compact && styles.compact]}>
      <Image
        accessible
        accessibilityRole="image"
        source={brandImage}
        accessibilityLabel="The Family Fund App"
        resizeMode="contain"
        style={{ width: "100%", height: compact ? 48 : 72 }}
      />
    </View>
  );
}
const styles = StyleSheet.create({
  brand: {
    backgroundColor: colors.ivory,
    borderRadius: corners.surface,
    padding: spacing.medium,
  },
  compact: { padding: spacing.small },
});
