import { Button, Row, Spacer, Text } from "@expo/ui";
import { colors, corners, spacing } from "@/theme/tokens";
import { useNativeTextMetrics } from "./use-native-text-metrics";

type NativeActionProps = {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  pending?: boolean;
  tone?: "primary" | "secondary" | "text";
  compact?: boolean;
};

// The entire painted label row remains tappable, including its padding.
export function NativeAction({
  label,
  onPress,
  disabled = false,
  pending = false,
  tone = "primary",
  compact = false,
}: NativeActionProps): React.JSX.Element {
  const primary = tone === "primary";
  const secondary = tone === "secondary";
  const text = useNativeTextMetrics();
  // Preserve a 48pt target even when the preferred text size is reduced.
  const verticalPadding = Math.max(14, (48 - text.fontSize) / 2);
  return (
    <Button
      onPress={onPress}
      variant="text"
      disabled={disabled || pending}
      style={{ opacity: disabled || pending ? 0.6 : 1 }}
    >
      <Row
        alignment="center"
        style={{
          ...(compact ? {} : { width: "100%" }),
          paddingVertical: verticalPadding,
          paddingHorizontal: compact ? spacing.small : spacing.medium,
          borderRadius: corners.action,
          backgroundColor: primary
            ? colors.action
            : secondary
              ? colors.sage
              : colors.ivory,
        }}
      >
        {!compact && <Spacer flexible />}
        <Text
          textStyle={{
            color: primary ? colors.white : colors.action,
            textAlign: "center",
            fontSize: text.fontSize,
            lineHeight: text.actionLineHeight,
            fontWeight: primary ? "600" : "500",
          }}
        >
          {pending ? "Please wait…" : label}
        </Text>
        {!compact && <Spacer flexible />}
      </Row>
    </Button>
  );
}
