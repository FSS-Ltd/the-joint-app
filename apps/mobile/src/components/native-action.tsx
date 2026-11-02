import { Button, Row, Spacer, Text } from "@expo/ui";
import { colors, corners, spacing } from "@/theme/tokens";

type NativeActionProps = {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  pending?: boolean;
  tone?: "primary" | "secondary" | "text";
  compact?: boolean;
};

// Native labels retain system text scaling; the entire label row remains tappable.
export function NativeAction({
  label,
  onPress,
  disabled = false,
  pending = false,
  tone = "primary",
  compact = false,
}: NativeActionProps): React.JSX.Element {
  const primary = tone === "primary";
  return (
    <Button onPress={onPress} variant="text" disabled={disabled || pending}>
      <Row
        alignment="center"
        style={{
          ...(compact ? {} : { width: "100%" }),
          paddingVertical: compact ? 12 : spacing.medium,
          paddingHorizontal: compact ? spacing.small : spacing.large,
          borderRadius: corners.action,
          backgroundColor: primary
            ? colors.action
            : tone === "secondary"
              ? colors.sage
              : "transparent",
          opacity: disabled || pending ? 0.6 : 1,
        }}
      >
        {!compact && <Spacer flexible />}
        <Text
          textStyle={{
            color: primary ? colors.white : colors.action,
            textAlign: "center",
            fontSize: 17,
          }}
        >
          {pending ? "Please wait…" : label}
        </Text>
        {!compact && <Spacer flexible />}
      </Row>
    </Button>
  );
}
