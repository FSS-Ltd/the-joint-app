import { liquiditySchema } from "@joint/contracts";
import { NativeField } from "@/components/native-field";
import { AccountChoice } from "./account-choice";
import { liquidityLabels } from "./account-labels";
import type { MetadataDraft } from "./write-input";
export function MetadataFields({
  value,
  onChange,
  disabled,
}: {
  value: MetadataDraft;
  onChange(value: MetadataDraft): void;
  disabled: boolean;
}): React.JSX.Element {
  return (
    <>
      <NativeField
        label="Account name"
        value={value.label}
        onChangeText={(label) => onChange({ ...value, label })}
        autoCapitalize="sentences"
        maxLength={80}
        editable={!disabled}
      />
      <AccountChoice
        label="Availability"
        value={value.liquidity}
        options={liquiditySchema.options}
        labels={liquidityLabels}
        onChange={(liquidity) => onChange({ ...value, liquidity })}
        disabled={disabled}
      />
    </>
  );
}
