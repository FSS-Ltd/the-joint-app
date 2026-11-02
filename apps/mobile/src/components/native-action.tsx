import { Button, Row, Spacer, Text } from "@expo/ui";

import { colors, corners, spacing } from "@/theme/tokens";

type NativeActionProps = {
  label: string;
  onPress: () => void;
};

// Render inside an @expo/ui Host. Native labels retain system text scaling.
export function NativeAction({
  label,
  onPress,
}: NativeActionProps): React.JSX.Element {
  return (
    <Button onPress={onPress} variant="text">
      <Row
        alignment="center"
        style={{
          width: "100%",
          paddingVertical: spacing.medium,
          paddingHorizontal: spacing.large,
          borderRadius: corners.action,
          backgroundColor: colors.action,
        }}
      >
        <Spacer flexible />
        <Text textStyle={{ color: colors.white, textAlign: "center" }}>
          {label}
        </Text>
        <Spacer flexible />
      </Row>
    </Button>
  );
}
