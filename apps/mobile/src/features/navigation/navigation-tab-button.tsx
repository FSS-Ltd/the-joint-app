import { Pressable, StyleSheet, type PressableProps } from "react-native";
import { colors } from "@/theme/tokens";

/** Preserve Router's native navigation/selection props while painting its selected capsule. */
export function NavigationTabButton({
  style,
  accessibilityState,
  ...props
}: PressableProps): React.JSX.Element {
  const selected =
    props["aria-selected"] ?? accessibilityState?.selected ?? false;
  return (
    <Pressable
      {...props}
      accessibilityState={{ ...accessibilityState, selected }}
      style={(state) => [
        typeof style === "function" ? style(state) : style,
        styles.button,
        selected && styles.selected,
      ]}
    />
  );
}
const styles = StyleSheet.create({
  button: {
    minHeight: 44,
    borderRadius: 24,
    overflow: "hidden",
    backgroundColor: "transparent",
  },
  selected: { backgroundColor: colors.ivory },
});
