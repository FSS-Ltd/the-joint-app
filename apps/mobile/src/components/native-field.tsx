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
import { View } from "react-native";
import { colors, corners, spacing } from "@/theme/tokens";
import { NativeAction } from "./native-action";
import { useNativeTextMetrics } from "./use-native-text-metrics";

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
  const text = useNativeTextMetrics();
  const stackedLabel = text.fontScale >= 1.3 || text.width < 360;
  const LabelLayout = stackedLabel ? Column : Row;
  useEffect(() => {
    nativeValue.value = value;
  }, [value, nativeValue]);
  return (
    <View style={{ gap: spacing.small }}>
      <Host
        colorScheme="light"
        seedColor={colors.action}
        matchContents={{ vertical: true }}
      >
        <LabelLayout
          alignment={stackedLabel ? "start" : "center"}
          style={{ width: "100%" }}
        >
          <Text
            textStyle={{
              color: colors.forest,
              fontSize: text.fontSize,
              fontWeight: "600",
            }}
          >
            {label}
          </Text>
          {!stackedLabel && <Spacer flexible />}
          {password && (
            <NativeAction
              label={`${visible ? "Hide" : "Show"} ${label.toLowerCase()}`}
              tone="text"
              compact
              onPress={() => setVisible(!visible)}
              disabled={props.editable === false}
            />
          )}
        </LabelLayout>
      </Host>
      <View
        style={{
          backgroundColor: colors.white,
          borderRadius: corners.action,
          borderWidth: focused ? 2 : 1,
          borderColor: focused ? colors.action : colors.secondary,
          overflow: "hidden",
        }}
      >
        <Host
          colorScheme="light"
          seedColor={colors.action}
          matchContents={{ vertical: true }}
        >
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
            textStyle={{
              color: colors.forest,
              fontSize: text.fontSize,
              lineHeight: text.fieldLineHeight,
            }}
            style={{
              padding: focused ? spacing.medium - 1 : spacing.medium,
            }}
          />
        </Host>
      </View>
    </View>
  );
}
