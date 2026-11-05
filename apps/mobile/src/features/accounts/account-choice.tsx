import { Host, Picker } from "@expo/ui";
import { AppText } from "@/components/app-text";
import { colors } from "@/theme/tokens";
export function AccountChoice<T extends string>({
  label,
  value,
  options,
  labels,
  onChange,
  disabled,
}: {
  label: string;
  value: T;
  options: readonly T[];
  labels: Record<T, string>;
  onChange(value: T): void;
  disabled: boolean;
}): React.JSX.Element {
  return (
    <>
      <AppText>{label}</AppText>
      <Host
        colorScheme="light"
        seedColor={colors.action}
        matchContents={{ vertical: true }}
      >
        <Picker
          selectedValue={value}
          onValueChange={onChange}
          enabled={!disabled}
        >
          {options.map((option) => (
            <Picker.Item
              key={option}
              value={option}
              label={`${label}: ${labels[option]}`}
            />
          ))}
        </Picker>
      </Host>
    </>
  );
}
