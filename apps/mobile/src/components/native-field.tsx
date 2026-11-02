import {
  Column,
  Host,
  Row,
  Spacer,
  Text,
  TextInput,
  useNativeState,
  type TextInputProps,
} from "@expo/ui";
import { useEffect, useState } from "react";
import { colors, spacing } from "@/theme/tokens";
import { NativeAction } from "./native-action";

type NativeFieldProps = Omit<TextInputProps, "value" | "onChangeText"> & {
  label: string;
  value: string;
  onChangeText(value: string): void;
  password?: boolean;
};
export function NativeField({
  label,
  value,
  onChangeText,
  password,
  ...props
}: NativeFieldProps): React.JSX.Element {
  const nativeValue = useNativeState(value);
  const [visible, setVisible] = useState(false);
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    nativeValue.value = value;
  }, [value, nativeValue]);
  return (
    <Host
      colorScheme="light"
      seedColor={colors.action}
      matchContents={{ vertical: true }}
    >
      <Column spacing={spacing.small}>
        <Row alignment="center" style={{ width: "100%" }}>
          <Text textStyle={{ color: colors.forest, fontWeight: "600" }}>
            {label}
          </Text>
          <Spacer flexible />
          {password && (
            <NativeAction
              label={`${visible ? "Hide" : "Show"} ${label.toLowerCase()}`}
              tone="text"
              compact
              onPress={() => setVisible(!visible)}
              disabled={props.editable === false}
            />
          )}
        </Row>
        <TextInput
          {...props}
          onFocus={() => {
            setFocused(true);
            props.onFocus?.();
          }}
          onBlur={() => {
            setFocused(false);
            props.onBlur?.();
          }}
          value={nativeValue}
          onChangeText={onChangeText}
          accessibilityLabel={label}
          secureTextEntry={Boolean(password && !visible)}
          autoCorrect={false}
          autoCapitalize={props.autoCapitalize ?? "none"}
          textStyle={{ color: colors.forest }}
          style={{
            padding: spacing.medium,
            backgroundColor: colors.white,
            borderRadius: 8,
            borderWidth: focused ? 2 : 1,
            borderColor: focused ? colors.action : colors.secondary,
          }}
        />
      </Column>
    </Host>
  );
}
