import type { PropsWithChildren } from "react";
import {
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { colors, spacing } from "@/theme/tokens";

export function Screen({
  children,
  compact = false,
  scrollable = true,
  nativeHeader = false,
}: PropsWithChildren<{
  compact?: boolean;
  scrollable?: boolean;
  nativeHeader?: boolean;
}>): React.JSX.Element {
  const { width } = useWindowDimensions();
  return (
    <View style={styles.shell}>
      <View
        pointerEvents="none"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        collapsable={false}
        style={styles.backdrop}
      >
        <View
          style={[
            styles.sageRibbon,
            { left: -width * 0.45, width: width * 1.55 },
          ]}
        />
        <View
          style={[
            styles.apricotRibbon,
            { right: -width * 0.75, width: width * 1.4 },
          ]}
        />
      </View>
      <SafeAreaView
        style={styles.safeArea}
        edges={nativeHeader ? ["left", "right", "bottom"] : undefined}
      >
        {scrollable ? (
          <ScrollView
            contentContainerStyle={[styles.content, compact && styles.compact]}
            automaticallyAdjustKeyboardInsets
            keyboardShouldPersistTaps="handled"
          >
            {children}
          </ScrollView>
        ) : (
          <View
            style={[
              styles.content,
              styles.nonScroll,
              compact && styles.compact,
            ]}
          >
            {children}
          </View>
        )}
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  shell: { flex: 1, backgroundColor: colors.forest },
  safeArea: { flex: 1, backgroundColor: "transparent" },
  backdrop: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    overflow: "hidden",
  },
  sageRibbon: {
    position: "absolute",
    top: -180,
    height: 540,
    borderRadius: 300,
    backgroundColor: colors.shellSage,
    transform: [{ rotate: "-24deg" }],
  },
  apricotRibbon: {
    position: "absolute",
    top: 420,
    height: 280,
    borderRadius: 180,
    backgroundColor: colors.shellApricot,
    transform: [{ rotate: "34deg" }],
  },
  content: {
    flexGrow: 1,
    width: "100%",
    maxWidth: 640,
    alignSelf: "center",
    padding: spacing.medium,
    gap: spacing.section,
  },
  nonScroll: { flex: 1 },
  compact: { gap: spacing.large },
});
